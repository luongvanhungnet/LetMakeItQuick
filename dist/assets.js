"use strict";
const mediaLibrary = [
  {"id": "lilac-explorer", "name": "Lilac explorer", "category": "Characters", "role": "player", "path": "media/library/lilac-explorer.png"},
  {"id": "orbit-robot", "name": "Orbit robot", "category": "Characters", "role": "player", "path": "media/library/orbit-robot.png"},
  {"id": "plum-gremlin", "name": "Plum gremlin", "category": "Creatures", "role": "enemy", "path": "media/library/plum-gremlin.png"},
  {"id": "reef-diver", "name": "Reef diver", "category": "Characters", "role": "player", "path": "media/library/reef-diver.png"},
  {"id": "tide-robot", "name": "Tide robot", "category": "Characters", "role": "player", "path": "media/library/tide-robot.png"},
  {"id": "lagoon-gremlin", "name": "Lagoon gremlin", "category": "Creatures", "role": "enemy", "path": "media/library/lagoon-gremlin.png"},
  {"id": "ember-pilot", "name": "Ember pilot", "category": "Characters", "role": "player", "path": "media/library/ember-pilot.png"},
  {"id": "copper-robot", "name": "Copper robot", "category": "Characters", "role": "player", "path": "media/library/copper-robot.png"},
  {"id": "cinder-gremlin", "name": "Cinder gremlin", "category": "Creatures", "role": "enemy", "path": "media/library/cinder-gremlin.png"},
  {"id": "moss-ranger", "name": "Moss ranger", "category": "Characters", "role": "player", "path": "media/library/moss-ranger.png"},
  {"id": "grove-robot", "name": "Grove robot", "category": "Characters", "role": "player", "path": "media/library/grove-robot.png"},
  {"id": "fern-gremlin", "name": "Fern gremlin", "category": "Creatures", "role": "enemy", "path": "media/library/fern-gremlin.png"},
  {"id": "ruby-crystal", "name": "Ruby crystal", "category": "Collectibles", "role": "gem", "path": "media/library/ruby-crystal.png"},
  {"id": "sapphire-crystal", "name": "Sapphire crystal", "category": "Collectibles", "role": "gem", "path": "media/library/sapphire-crystal.png"},
  {"id": "emerald-crystal", "name": "Emerald crystal", "category": "Collectibles", "role": "gem", "path": "media/library/emerald-crystal.png"},
  {"id": "amber-crystal", "name": "Amber crystal", "category": "Collectibles", "role": "gem", "path": "media/library/amber-crystal.png"},
  {"id": "amethyst-crystal", "name": "Amethyst crystal", "category": "Collectibles", "role": "gem", "path": "media/library/amethyst-crystal.png"},
  {"id": "pearl-crystal", "name": "Pearl crystal", "category": "Collectibles", "role": "gem", "path": "media/library/pearl-crystal.png"},
  {"id": "gold-token", "name": "Gold token", "category": "Collectibles", "role": "gem", "path": "media/library/gold-token.png"},
  {"id": "silver-token", "name": "Silver token", "category": "Collectibles", "role": "gem", "path": "media/library/silver-token.png"},
  {"id": "copper-token", "name": "Copper token", "category": "Collectibles", "role": "gem", "path": "media/library/copper-token.png"},
  {"id": "mint-token", "name": "Mint token", "category": "Collectibles", "role": "gem", "path": "media/library/mint-token.png"},
  {"id": "woodland-wall", "name": "Woodland wall", "category": "Terrain", "role": "wall", "path": "media/library/woodland-wall.png"},
  {"id": "woodland-gate", "name": "Woodland gate", "category": "Portals", "role": "exit", "path": "media/library/woodland-gate.png"},
  {"id": "basalt-wall", "name": "Basalt wall", "category": "Terrain", "role": "wall", "path": "media/library/basalt-wall.png"},
  {"id": "basalt-gate", "name": "Basalt gate", "category": "Portals", "role": "exit", "path": "media/library/basalt-gate.png"},
  {"id": "sandstone-wall", "name": "Sandstone wall", "category": "Terrain", "role": "wall", "path": "media/library/sandstone-wall.png"},
  {"id": "sandstone-gate", "name": "Sandstone gate", "category": "Portals", "role": "exit", "path": "media/library/sandstone-gate.png"},
  {"id": "ice-wall", "name": "Ice wall", "category": "Terrain", "role": "wall", "path": "media/library/ice-wall.png"},
  {"id": "ice-gate", "name": "Ice gate", "category": "Portals", "role": "exit", "path": "media/library/ice-gate.png"},
  {"id": "coral-wall", "name": "Coral wall", "category": "Terrain", "role": "wall", "path": "media/library/coral-wall.png"},
  {"id": "coral-gate", "name": "Coral gate", "category": "Portals", "role": "exit", "path": "media/library/coral-gate.png"},
  {"id": "night-wall", "name": "Night wall", "category": "Terrain", "role": "wall", "path": "media/library/night-wall.png"},
  {"id": "night-gate", "name": "Night gate", "category": "Portals", "role": "exit", "path": "media/library/night-gate.png"},
  {"id": "slate-wall", "name": "Slate wall", "category": "Terrain", "role": "wall", "path": "media/library/slate-wall.png"},
  {"id": "slate-gate", "name": "Slate gate", "category": "Portals", "role": "exit", "path": "media/library/slate-gate.png"},
  {"id": "brick-wall", "name": "Brick wall", "category": "Terrain", "role": "wall", "path": "media/library/brick-wall.png"},
  {"id": "brick-gate", "name": "Brick gate", "category": "Portals", "role": "exit", "path": "media/library/brick-gate.png"},
  {"id": "thorns-trap", "name": "Thorns trap", "category": "Hazards", "role": "hazard", "path": "media/library/thorns-trap.png"},
  {"id": "lava-trap", "name": "Lava trap", "category": "Hazards", "role": "hazard", "path": "media/library/lava-trap.png"},
  {"id": "icicles-trap", "name": "Icicles trap", "category": "Hazards", "role": "hazard", "path": "media/library/icicles-trap.png"},
  {"id": "static-trap", "name": "Static trap", "category": "Hazards", "role": "hazard", "path": "media/library/static-trap.png"},
  {"id": "slime-trap", "name": "Slime trap", "category": "Hazards", "role": "hazard", "path": "media/library/slime-trap.png"},
  {"id": "bramble-trap", "name": "Bramble trap", "category": "Hazards", "role": "hazard", "path": "media/library/bramble-trap.png"},
  {"id": "pine-tree", "name": "Pine tree", "category": "Decor", "role": "decor", "path": "media/library/pine-tree.png"},
  {"id": "blossom-tree", "name": "Blossom tree", "category": "Decor", "role": "decor", "path": "media/library/blossom-tree.png"},
  {"id": "winter-tree", "name": "Winter tree", "category": "Decor", "role": "decor", "path": "media/library/winter-tree.png"},
  {"id": "autumn-tree", "name": "Autumn tree", "category": "Decor", "role": "decor", "path": "media/library/autumn-tree.png"},
  {"id": "twilight-tree", "name": "Twilight tree", "category": "Decor", "role": "decor", "path": "media/library/twilight-tree.png"},
  {"id": "jungle-tree", "name": "Jungle tree", "category": "Decor", "role": "decor", "path": "media/library/jungle-tree.png"},
  {"id": "woodland-dawn", "name": "Woodland dawn", "category": "Backgrounds", "role": "background", "path": "media/library/woodland-dawn.png"},
  {"id": "violet-twilight", "name": "Violet twilight", "category": "Backgrounds", "role": "background", "path": "media/library/violet-twilight.png"},
  {"id": "copper-desert", "name": "Copper desert", "category": "Backgrounds", "role": "background", "path": "media/library/copper-desert.png"},
  {"id": "glacier-morning", "name": "Glacier morning", "category": "Backgrounds", "role": "background", "path": "media/library/glacier-morning.png"},
  {"id": "deep-reef", "name": "Deep reef", "category": "Backgrounds", "role": "background", "path": "media/library/deep-reef.png"},
  {"id": "moonlit-ridge", "name": "Moonlit ridge", "category": "Backgrounds", "role": "background", "path": "media/library/moonlit-ridge.png"},
  {"id": "cherry-skies", "name": "Cherry skies", "category": "Backgrounds", "role": "background", "path": "media/library/cherry-skies.png"},
  {"id": "moss-valley", "name": "Moss valley", "category": "Backgrounds", "role": "background", "path": "media/library/moss-valley.png"},
  {"id": "forest-photo", "name": "Forest canopy", "category": "Photos", "role": "background", "path": "media/forest.jpg"},
  {"id": "interior-photo", "name": "Studio interior", "category": "Photos", "role": "background", "path": "media/interior.jpg"},
  {"id": "coffee-photo", "name": "Coffee bar", "category": "Photos", "role": "background", "path": "media/coffee.jpg"}
];

const assetById = new Map(mediaLibrary.map((asset) => [asset.id,asset]));
const assetByPath = new Map(mediaLibrary.map((asset) => [asset.path,asset]));

function assetPicker(onSelect) {
  const categories = [...new Set(mediaLibrary.map((asset) => asset.category))];
  openDialog("Asset library", '<div class="asset-filters"><label class="search">'+icon("search")+'<input type="search" id="asset-search" placeholder="Search assets…" aria-label="Search assets"></label><select id="asset-filter" aria-label="Asset category"><option value="">All categories</option>'+categories.map((category) => '<option>'+category+'</option>').join("")+'</select></div><div id="asset-results" class="asset-grid"></div>');
  modal.classList.add("asset-dialog");
  function render() {
    const search = $("#asset-search").value.trim().toLowerCase();
    const category = $("#asset-filter").value;
    const matches = mediaLibrary.filter((asset) => (!category || asset.category === category) && (asset.name+" "+asset.category).toLowerCase().includes(search));
    $("#asset-results").innerHTML = matches.map((asset) => {
      const art = '<img src="'+asset.path+'" alt="" loading="lazy"><strong>'+asset.name+'</strong>';
      return onSelect ? '<button type="button" class="asset-card" data-asset="'+asset.id+'">'+art+'</button>' : '<a class="asset-card" href="'+asset.path+'" download aria-label="Download '+asset.name+'">'+art+'</a>';
    }).join("") || '<p class="empty">No assets match your search.</p>';
  }
  $("#asset-search").addEventListener("input",render);
  $("#asset-filter").addEventListener("change",render);
  $("#asset-results").addEventListener("click",(event) => {
    const card = event.target.closest("[data-asset]");
    if (card && onSelect) { modal.close(); onSelect(assetById.get(card.dataset.asset)); }
  });
  render();
}
