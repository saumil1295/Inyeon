const SUPABASE_URL="https://fjgshtktadaddwmshugw.supabase.co";
const SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqZ3NodGt0YWRhZGR3bXNodWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzEzODQsImV4cCI6MjEwNDk0NzM4NH0.fMUzZ2chICrxSvRVdwrEb9TseFY532kC2KtsvV_zpGM";

const client=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let currentUser;
let profile;

const avatar={
skin:"medium",
hair:"messy",
hairColor:"#2E2A28",
mouth:"smile",
outfit:"hoodie",
bg:"#A3B18A"
};

const skinColours={
light:"#F6D7C3",
medium:"#E8BC96",
tan:"#C78B63",
deep:"#8D5A3B"
};

const bgColours=[
"#A3B18A",
"#6E93AA",
"#B36A7C",
"#C38C3B",
"#7A5A84",
"#467A73"
];

const hairColours=[
"#2E2A28",
"#5A3E2B",
"#8B5E3C",
"#C89C73",
"#B55C5C",
"#8E8E8E"
];

const outfits={
hoodie:"#46684A",
tee:"#D9D3C8",
sweater:"#A27C55",
shirt:"#5B7EA6"
};

function renderAvatar(){

const skin=skinColours[avatar.skin];
const shirt=outfits[avatar.outfit];

const hairShapes = {

  // Soft textured fringe
  messy: "M48 72 C50 46 74 38 92 44 C104 34 126 40 140 56 C146 68 144 82 132 88 C120 82 104 84 90 90 C74 86 58 88 48 72 Z",

  // Rounded short crop
  short: "M56 70 C56 48 144 48 144 70 C140 80 60 80 56 70 Z",

  // Side-part with a swept fringe
  side: "M54 72 C58 46 140 44 146 64 C138 70 122 72 110 78 C96 72 76 74 54 72 Z",

  // Fluffy curls
  curly: "M52 72 C56 52 72 44 84 52 C94 40 110 42 120 52 C132 42 146 52 148 72 C138 84 62 84 52 72 Z",

  // Clean bun
  bun: "M58 72 C58 50 142 50 142 72 C138 82 62 82 58 72 M100 40 A12 12 0 1 1 99 40"

};

const mouths={
smile:'<path d="M84 126 Q100 138 116 126" stroke="#9A5E47" stroke-width="3" fill="none" stroke-linecap="round"/>',
happy:'<path d="M80 124 Q100 142 120 124" stroke="#9A5E47" stroke-width="4" fill="none" stroke-linecap="round"/>',
neutral:'<line x1="86" y1="128" x2="114" y2="128" stroke="#9A5E47" stroke-width="3" stroke-linecap="round"/>',
sad:'<path d="M84 132 Q100 118 116 132" stroke="#9A5E47" stroke-width="3" fill="none" stroke-linecap="round"/>',
surprised:'<circle cx="100" cy="128" r="6" fill="none" stroke="#9A5E47" stroke-width="3"/>'
};

const svg=`
<svg viewBox="0 0 200 200" width="180" height="180">

<circle cx="100" cy="100" r="100" fill="${avatar.bg}"/>

<path d="M35 188 C55 146 145 146 165 188" fill="${shirt}"/>

<ellipse cx="100" cy="104" rx="40" ry="48" fill="${skin}"/>

<path d="${hairShapes[avatar.hair]}" fill="${avatar.hairColor}"/>

<circle cx="88" cy="104" r="4.5" fill="#231F20"/>
<circle cx="112" cy="104" r="4.5" fill="#231F20"/>

${mouths[avatar.mouth]}

</svg>`;

document.getElementById("avatarPreview").innerHTML=svg;
document.getElementById("editorAvatarPreview").innerHTML=svg;

}

function buildColourOptions(container,colours,key){

container.innerHTML="";

colours.forEach(colour=>{

const btn=document.createElement("button");
btn.type="button";
btn.className="colour-option";
btn.style.background=colour;

if(avatar[key]===colour)btn.classList.add("selected");

btn.onclick=()=>{

avatar[key]=colour;
renderAvatar();
buildColourOptions(container,colours,key);

};

container.appendChild(btn);

});

}

function buildSkin(){

const el=document.getElementById("skinOptions");
el.innerHTML="";

Object.entries(skinColours).forEach(([name,colour])=>{

const btn=document.createElement("button");
btn.className="colour-option";
btn.style.background=colour;

if(avatar.skin===name)btn.classList.add("selected");

btn.onclick=()=>{

avatar.skin=name;
renderAvatar();
buildSkin();

};

el.appendChild(btn);

});

}

function buildHair(){

const styles = ["messy", "short", "side", "curly", "bun"];
const container=document.getElementById("hairOptions");
container.innerHTML="";

styles.forEach(style=>{

const btn=document.createElement("button");
btn.className=`avatar-thumb ${avatar.hair===style?"selected":""}`;

btn.innerHTML=`
<div class="thumb-head"></div>
<div class="thumb-hair ${style}" style="background:${avatar.hairColor}"></div>
`;

btn.onclick=()=>{
avatar.hair=style;
renderAvatar();
buildHair();
};

container.appendChild(btn);

});
}

function buildFace(){

const expressions=["smile","happy","neutral","sad","surprised"];
const container=document.getElementById("faceOptions");
container.innerHTML="";

expressions.forEach(exp=>{

const btn=document.createElement("button");
btn.className=`avatar-thumb ${avatar.mouth===exp?"selected":""}`;

btn.innerHTML=`
<div class="thumb-face">
<div class="thumb-mouth ${exp}"></div>
</div>
`;

btn.onclick=()=>{
avatar.mouth=exp;
renderAvatar();
buildFace();
};

container.appendChild(btn);

});
}

function buildOutfits(){

const container=document.getElementById("outfitOptions");
container.innerHTML="";

Object.entries(outfits).forEach(([name,color])=>{

const btn=document.createElement("button");
btn.className=`avatar-thumb ${avatar.outfit===name?"selected":""}`;

btn.innerHTML=`
<div class="thumb-outfit" style="background:${color}"></div>
`;

btn.onclick=()=>{
avatar.outfit=name;
renderAvatar();
buildOutfits();
};

container.appendChild(btn);

});
}

document.querySelectorAll(".tab").forEach(tab=>{

tab.onclick=()=>{

document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
document.querySelectorAll(".tab-content").forEach(c=>c.classList.remove("active"));

tab.classList.add("active");
document.getElementById(tab.dataset.tab+"Tab").classList.add("active");

};

});

const avatarModal=document.getElementById("avatarModal");

document.getElementById("editAvatarBtn").onclick=()=>{

avatarModal.classList.remove("hidden");
document.body.style.overflow="hidden";

};

document.getElementById("closeAvatar").onclick=()=>{

avatarModal.classList.add("hidden");
document.body.style.overflow="";

};

avatarModal.onclick=e=>{

if(e.target===avatarModal){

avatarModal.classList.add("hidden");
document.body.style.overflow="";

}

};

document.getElementById("bioInput").addEventListener("input",e=>{

document.getElementById("bioCount").textContent=e.target.value.length;

});

document.getElementById("saveProfile").onclick=async()=>{

await client.from("profiles").update({

alias:document.getElementById("aliasInput").value,
bio:document.getElementById("bioInput").value,
avatar_color:avatar.bg,
avatar_data:avatar

}).eq("id",currentUser.id);

};

(async()=>{

const{data:{session}}=await client.auth.getSession();

if(!session){

window.location.href="auth.html";
return;

}

currentUser=session.user;

const{data}=await client.from("profiles").select("*").eq("id",currentUser.id).single();

profile=data;

document.getElementById("aliasInput").value=profile.alias||"";
document.getElementById("bioInput").value=profile.bio||"";
document.getElementById("bioCount").textContent=(profile.bio||"").length;

Object.assign(avatar,profile.avatar_data||{});

buildSkin();
buildHair();
buildFace();
buildOutfits();

buildColourOptions(document.getElementById("bgOptions"),bgColours,"bg");
buildColourOptions(document.getElementById("hairColourOptions"),hairColours,"hairColor");

renderAvatar();

})();