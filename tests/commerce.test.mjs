import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {test} from "node:test";
import worker from "../dist/server/index.js";
import {localData} from "../worker/dev-data.mjs";

const origin = "https://studio.example";
const offerId = "commerce-project";
const encode = overrides => Buffer.from(JSON.stringify({
  type:"web",template:"blank",name:"Weekend Guide",title:"First release",intro:"An illustrated trail guide.",button:"Guide",section:"Downloads",details:"Choose a route.",color:"#643bed",...overrides
})).toString("base64url");
const baseOffer = {name:"Weekend Guide",summary:"An illustrated trail guide.",price:900,currency:"usd",kind:"download",active:true,snapshot:encode()};

function commerceFixture(t,config={}) {
  const db = localData();
  t.after(()=>db.close());
  const env = {LAUNCHPAD_DATA:db,...config};
  const request = (path,{method="GET",user="owner",body,headers={}}={})=>worker.fetch(new Request(origin+"/api/commerce"+path,{
    method,headers:{...(user ? {"oai-authenticated-user-id":user,"oai-authenticated-user-email":user+"@example.test"} : {}),
      ...(body !== undefined ? {Origin:origin,"Content-Type":"application/json"} : {}),...headers},
    ...(body !== undefined ? {body:typeof body === "string" ? body : JSON.stringify(body)} : {})
  }),env);
  const save = (overrides={})=>request("/offers/"+offerId,{method:"PUT",body:{...baseOffer,...overrides}});
  const store = "/store/"+offerId;
  const checkout = (id,body={},user="buyer")=>request(store+"/checkout",{method:"POST",user,
    body:{idempotency:id,source:"video",campaign:"launch",...body}});
  const delivery = (id,user="buyer")=>request(store+"/delivery/"+id,{user});
  const refund = (id,user="owner")=>request("/offers/"+offerId+"/"+id+"/refund",{method:"POST",body:{},user});
  return {request,save,store,checkout,delivery,refund,env};
}

test("simulated checkout provides a frozen product, rejects declines, and revokes access after an idempotent refund",async t=>{
  const {request,save,store,checkout,delivery,refund} = commerceFixture(t);
  assert.equal((await save()).status,200);
  const publicOffer = await (await request(store,{user:null})).json();
  assert.equal(publicOffer.offer.name,baseOffer.name);
  assert.equal(publicOffer.offer.snapshot,undefined);
  assert.deepEqual(publicOffer.orders,[]);
  assert.equal((await request("/offers/"+offerId,{method:"PUT",user:"other",body:baseOffer})).status,404);
  assert.equal((await request(store+"/checkout",{method:"POST",user:null,body:{idempotency:"no-account"}})).status,401);
  assert.equal((await request(store+"/checkout",{method:"POST",user:"buyer",body:{idempotency:"cross-origin"},headers:{Origin:"https://elsewhere.example"}})).status,403);

  const declined = await (await checkout("declined-order",{outcome:"failure"})).json();
  assert.equal(declined.order.status,"failed");
  assert.equal((await delivery("declined-order")).status,403);

  const first = await (await checkout("purchase-one")).json();
  assert.equal(first.order.status,"paid");
  assert.equal(first.order.mode,"test");
  assert.equal(first.order.checkoutProvider,"simulated");
  assert.equal(first.order.source,"video");
  assert.equal(first.order.campaign,"launch");
  assert.ok(first.order.fee>0);
  const duplicate = await (await checkout("purchase-one")).json();
  assert.deepEqual(duplicate.order,first.order);
  assert.equal((await checkout("new-purchase")).status,409);
  assert.equal((await delivery("purchase-one","other")).status,404);
  assert.equal((await (await delivery("purchase-one")).json()).snapshot,baseOffer.snapshot);

  const newer = encode({title:"Second release"});
  await save({snapshot:newer,kind:"access",price:2000});
  const second = await (await checkout("purchase-two")).json();
  assert.equal(second.order.kind,"access");
  assert.notEqual(second.order.releaseId,first.order.releaseId);
  assert.equal((await (await delivery("purchase-one")).json()).snapshot,baseOffer.snapshot);
  assert.equal((await (await delivery("purchase-two")).json()).snapshot,newer);
  assert.equal((await refund("purchase-one","other")).status,404);
  const refunded = await (await refund("purchase-one")).json();
  assert.equal(refunded.order.status,"refunded");
  assert.equal(refunded.order.refundAmount,900);
  assert.deepEqual((await (await refund("purchase-one")).json()).order,refunded.order);
  assert.equal((await delivery("purchase-one")).status,403);
  assert.equal((await delivery("purchase-two")).status,200);
  const history = await (await request("")).json();
  assert.equal(history.orders.length,3);
  assert.equal(history.orders.filter(order=>order.status==="refunded").length,1);
});

test("Stripe test checkout verifies webhook signatures, matches order amounts, handles duplicates and reconciles refunds",async t=>{
  const secret = "whsec_mock_signing_secret";
  const {request,save,store,checkout,delivery,refund} = commerceFixture(t,{
    STRIPE_TEST_SECRET_KEY:"sk_test_fixture",STRIPE_TEST_WEBHOOK_SECRET:secret
  });
  assert.equal((await save()).status,200);
  const orderId="stripe-order";
  const calls=[];
  let feeReady=false;
  const session = {id:"cs_test_abc",livemode:false,metadata:{listing:offerId,order:orderId},
    amount_total:900,currency:"usd",payment_status:"unpaid",status:"open",url:"https://checkout.stripe.com/test/fixture"};
  const original = globalThis.fetch;
  t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch = async (url,options={})=>{
    calls.push({url,options});
    assert.equal(options.headers.Authorization,"Bearer sk_test_fixture");
    if (url === "https://api.stripe.com/v1/checkout/sessions") {
      assert.equal(options.headers["Idempotency-Key"],"launchpad-checkout-"+offerId+"-"+orderId);
      assert.equal(options.body.get("line_items[0][price_data][unit_amount]"),"900");
      return Response.json(session);
    }
    if (url === "https://api.stripe.com/v1/checkout/sessions/cs_test_abc") return Response.json(paid);
    if (url.startsWith("https://api.stripe.com/v1/payment_intents/")) {
      return Response.json({id:"pi_test_abc",livemode:false,metadata:session.metadata,
        latest_charge:{balance_transaction:feeReady ? {fee:57} : null}});
    }
    if (url === "https://api.stripe.com/v1/refunds") {
      assert.equal(options.body.get("payment_intent"),"pi_test_abc");
      assert.equal(options.headers["Idempotency-Key"],"launchpad-refund-"+offerId+"-"+orderId);
      return Response.json({livemode:false,status:"succeeded"});
    }
    throw Error("Unexpected Stripe API request "+url);
  };
  const started = await (await checkout(orderId)).json();
  assert.equal(started.order.status,"pending");
  assert.equal(started.checkout,session.url);
  assert.equal((await delivery(orderId)).status,403);

  const paid = {...session,payment_status:"paid",status:"complete",payment_intent:"pi_test_abc"};
  async function event(type,object,{signature=true,stamp=Math.floor(Date.now()/1000),livemode=false}={}) {
    const body=JSON.stringify({id:"evt_test_example",type,livemode,data:{object}});
    const hmac=signature ? createHmac("sha256",secret).update(stamp+"."+body).digest("hex") : "a".repeat(64);
    return request("/stripe-webhook",{method:"POST",user:null,body,headers:{"Stripe-Signature":"t="+stamp+",v1="+hmac}});
  }
  assert.equal((await event("checkout.session.completed",paid,{signature:false})).status,401);
  assert.equal((await event("checkout.session.completed",paid,{stamp:Math.floor(Date.now()/1000)-360})).status,401);
  assert.equal((await event("checkout.session.completed",paid,{livemode:true})).status,409);
  assert.equal((await event("checkout.session.completed",{...paid,amount_total:500})).status,409);
  assert.equal((await delivery(orderId)).status,403);
  assert.equal((await event("checkout.session.completed",paid)).status,200);
  assert.equal((await (await delivery(orderId)).json()).order.fee,null);
  feeReady=true;
  const reconcile = user => request("/offers/"+offerId+"/"+orderId+"/reconcile",{method:"POST",body:{},user});
  assert.equal((await reconcile("other")).status,404);
  const reconciled = (await (await reconcile("owner")).json()).order;
  assert.equal(reconciled.fee,57);
  assert.equal((await event("checkout.session.completed",paid)).status,200);
  assert.equal(calls.filter(({url})=>url.includes("/payment_intents/")).length,2);
  const delivered = await (await delivery(orderId)).json();
  assert.equal(delivered.order.fee,57);
  assert.equal(delivered.snapshot,baseOffer.snapshot);
  assert.equal((await refund(orderId)).status,200);
  assert.equal((await refund(orderId)).status,200);
  assert.equal(calls.filter(({url})=>url.endsWith("/refunds")).length,1);
  assert.equal((await event("checkout.session.completed",paid)).status,200);
  const history = await (await request(store,{user:"buyer"})).json();
  assert.equal(history.orders.length,1);
  assert.equal(history.orders[0].status,"refunded");
  assert.equal((await delivery(orderId)).status,403);
});
