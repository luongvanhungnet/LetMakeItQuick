"use strict";

const game3DTemplates = [
  {...gameTemplates[1],id:"orbit-3d",layout:"orbit",type:"game3d",name:"Orbital Vault",title:"Orbital Vault",desc:"Recover lunar tokens in a 3D vault with a rotating camera.",category:"3D arcade"},
  {...gameTemplates[0],id:"woodland-3d",layout:"woodland",type:"game3d",name:"Canopy Keep",title:"Canopy Keep",desc:"Build a 3D maze with mossy walls, crystals, and patrolling creatures.",category:"3D maze"}
];
const isGameType = (type) => type === "game" || type === "game3d";

function drawGame3D(context, state, background, images, turn, wallHeight = 1) {
  if (background?.complete && background.naturalWidth) context.drawImage(background,0,0,640,400);
  else { context.fillStyle = "#271e43"; context.fillRect(0,0,640,400); }
  context.fillStyle = "#11092670";
  context.fillRect(0,0,640,400);
  const angle = Math.PI/7 + turn*Math.PI/2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  function project(x,y,z) {
    const u = x-state.width/2, v = z-state.height/2;
    const right = u*cos-v*sin;
    const forward = u*sin+v*cos;
    const depth = 27-forward*.72-y*.69;
    const scale = 790/depth;
    return [320+right*scale,210+(forward*.69-y*.72)*scale,depth,scale];
  }
  const faces = [];
  function polygon(points, fill, stroke) {
    const path = points.map((point) => project(...point));
    faces.push({depth:path.reduce((sum,point) => sum+point[2],0)/path.length,paint() {
      context.beginPath();
      for (const [index,[x,y]] of path.entries()) {
        if (index === 0) context.moveTo(x,y);
        else context.lineTo(x,y);
      }
      context.closePath();
      context.fillStyle = fill;
      context.fill();
      if (stroke) { context.strokeStyle = stroke; context.stroke(); }
    }});
  }
  for (let z=0;z<state.height;z++) {
    for (let x=0;x<state.width;x++) {
      polygon([[x,0,z],[x,0,z+1],[x+1,0,z+1],[x+1,0,z]],(x+z)%2 ? "#302751" : "#392e5d","#4b3b72");
    }
  }
  faces.sort((a,b) => b.depth-a.depth).forEach((face) => face.paint());
  faces.length = 0;
  function box(x,z,base,size,height,hue) {
    const h = base+height, r = size/2;
    const a=x-r, b=x+r, c=z-r, d=z+r;
    polygon([[a,base,c],[a,h,c],[b,h,c],[b,base,c]],"hsl("+hue+" 34% 36%)");
    polygon([[a,base,d],[a,h,d],[b,h,d],[b,base,d]],"hsl("+hue+" 38% 44%)");
    polygon([[a,base,c],[a,h,c],[a,h,d],[a,base,d]],"hsl("+hue+" 37% 41%)");
    polygon([[b,base,c],[b,h,c],[b,h,d],[b,base,d]],"hsl("+hue+" 35% 32%)");
    polygon([[a,h,c],[b,h,c],[b,h,d],[a,h,d]],"hsl("+hue+" 52% 66%)");
  }
  function actorMesh(actor) {
    const x = actor.index%state.width+.5, z = Math.floor(actor.index/state.width)+.5;
    const hue = Array.from(actor.id).reduce((sum,char) => sum+char.charCodeAt(0),0)%360;
    if (actor.role === "wall") { box(x,z,0,.97,.65+.3*wallHeight,hue); return; }
    if (actor.role === "exit") box(x,z,0,.86,.2,165);
    if (actor.role === "hazard") box(x,z,0,.76,.1,8);
    if (actor.role === "player") box(x,z,0,.56,.08,270);
    const lift = actor.role === "gem" ? .55 : .62;
    const [screenX,screenY,depth,scale] = project(x,lift,z);
    const image = images[actor.id];
    faces.push({depth,paint() {
      if (image?.complete && image.naturalWidth) {
        const size=scale*(actor.role === "exit" ? 1.8 : 1.45);
        context.drawImage(image,screenX-size/2,screenY-size*.72,size,size);
      } else {
        context.fillStyle = "hsl("+hue+" 70% 64%)";
        context.fillRect(screenX-4,screenY-10,8,10);
      }
    }});
  }
  Object.values(state.tiles).forEach(actorMesh);
  state.enemies.forEach(actorMesh);
  if (state.player) actorMesh(state.player);
  faces.sort((a,b) => b.depth-a.depth).forEach((face) => face.paint());
}
