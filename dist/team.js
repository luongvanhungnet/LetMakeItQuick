"use strict";

function teamCall(path = "",body) {
  return apiJSON("/api/team"+path,body === undefined ? {} : {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
}
async function openTeam() {
  const project = page === "editor" ? current : null;
  openDialog("Project collaboration",'<div id="team-status" role="status" class="subtext">Loading project teams…</div><div id="team-content"></div><div class="dialog-actions"><button class="secondary" type="button" id="join-team">Accept an invitation</button></div>');
  const box = $("#team-content"), status = $("#team-status");
  $("#join-team").addEventListener("click",()=>{
    box.innerHTML = '<form id="team-join"><label class="field">Invitation code<input name="invite" required maxlength="85"></label><button class="primary">Join project</button></form>';
    status.textContent = "";
    $("#team-join").addEventListener("submit",async event=>{
      event.preventDefault();
      const [id,token,...rest] = event.currentTarget.elements.invite.value.trim().split(".");
      if (!id || !token || rest.length) { status.textContent = "Enter a valid invitation code."; return; }
      try { await teamCall("/"+encodeURIComponent(id)+"/accept",{token}); await renderTeam(id); }
      catch (error) { status.textContent = error.message; }
    });
  });
  async function renderTeam(id) {
    const {team,stage,members,comments,approved} = await teamCall("/"+encodeURIComponent(id));
    if (!box.isConnected) return;
    const owner = team.role === "owner", reviewer = team.role === "reviewer";
    const actions = owner ? '<form id="team-invite"><label class="field">Invite as<select name="role"><option value="reviewer">Reviewer</option><option value="viewer">Viewer</option></select></label><button class="secondary">Generate invitation</button></form><label class="field" id="team-share" hidden>Invitation code<input readonly></label>'+
      '<label class="template-switch"><input id="team-approval" type="checkbox" '+(team.requireApproval?"checked":"")+'> Require review before publishing</label>'+
      '<ul>'+members.map(member=>'<li>'+esc(member.role)+' · '+esc(member.id)+' <button class="filter" data-revoke="'+esc(member.id)+'">Revoke</button></li>').join("")+'</ul>' : "";
    box.innerHTML = '<h3>'+esc(team.name)+'</h3><p class="subtext">'+esc(team.role)+' · '+team.memberCount+' collaborators</p>'+actions+
      (stage ? '<p class="subtext">'+(approved?"Reviewer approval recorded":"The staged version is ready for review.")+'</p><button class="secondary" id="team-preview">Preview staged version</button>'+(reviewer && !approved?'<button class="primary" id="team-approve">Approve this version</button>':"")+"<div id=\"team-preview-body\"></div>" : '<p class="subtext">Stage a release to request review.</p>')+
      '<h3>Comments</h3><ul class="team-comments">'+comments.map(comment=>'<li><strong>'+esc(comment.role)+'</strong><p>'+esc(comment.text)+'</p></li>').join("")+'</ul>'+
      ((reviewer || owner) ? '<form id="team-comment"><label class="field">Comment<textarea name="text" maxlength="1200" required></textarea></label><button class="secondary">Add comment</button></form>' : "");
    status.textContent = "";
    async function mutate(action,body,refresh=true) {
      try {
        const result = await teamCall("/"+id+"/"+action,body);
        if (refresh) await renderTeam(id);
        return result;
      } catch (error) { status.textContent = error.message; return null; }
    }
    $("#team-invite")?.addEventListener("submit",async event=>{
      event.preventDefault();
      const result = await mutate("invite",{role:event.currentTarget.elements.role.value},false);
      if (!result) return;
      const share = $("#team-share");
      share.hidden = false;
      share.querySelector("input").value = result.invite;
      share.querySelector("input").select();
      status.textContent = "Share this single-use code with your collaborator. It expires in seven days.";
    });
    $("#team-approval")?.addEventListener("change",event=>mutate("settings",{requireApproval:event.target.checked}));
    for (const button of box.querySelectorAll("[data-revoke]")) button.addEventListener("click",()=>mutate("revoke",{member:button.dataset.revoke}));
    $("#team-approve")?.addEventListener("click",()=>mutate("approve",{stageId:stage.id}));
    $("#team-comment")?.addEventListener("submit",event=>{event.preventDefault();void mutate("comment",{text:event.currentTarget.elements.text.value});});
    $("#team-preview")?.addEventListener("click",()=>{
      try {
        const staged = readSnapshot("#view="+stage.snapshot), target = $("#team-preview-body");
        if (isGameType(staged.type) || staged.type === "video") {
          status.textContent = "This preview shows website and app releases. Ask the owner for the game or video test build.";
          return;
        }
        const frame = document.createElement("iframe");
        frame.title = "Staged project";
        frame.setAttribute("sandbox","allow-scripts");
        frame.srcdoc = projectHTML(staged);
        target.replaceChildren(frame);
      } catch { status.textContent = "Preview unavailable."; }
    });
  }
  try {
    const {teams} = await teamCall();
    if (!box.isConnected) return;
    status.textContent = "";
    box.innerHTML = '<ul class="team-comments">'+teams.map(team=>'<li><button class="secondary" data-team-id="'+esc(team.id)+'">'+esc(team.name)+' · '+esc(team.role)+'</button></li>').join("")+'</ul>'+
      (project?'<button class="primary" id="create-team">Open this project’s team</button>':'');
    for (const button of box.querySelectorAll("[data-team-id]")) button.addEventListener("click",()=>renderTeam(button.dataset.teamId).catch(error=>{status.textContent=error.message;}));
    $("#create-team")?.addEventListener("click",async()=>{
      try { const {team} = await teamCall("",{projectId:project.id,name:project.name}); await renderTeam(team.id); }
      catch (error) { status.textContent = error.message; }
    });
  } catch (error) { status.textContent = error.message; }
}
