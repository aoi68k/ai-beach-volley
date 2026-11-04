// REJECTED: retained for diagnosis only; not used by the game or character preview.
// See ../RUN_ANIMATION_REVIEW.md. Coordinate continuity did not establish visual quality.
// Coordinates are in a 256px cell; output PNGs are used by the game, not this renderer.
(function(root){
const rightStance=[[158,185,166,246],[151,194,147,246],[137,198,124,246],[112,190,97,246],[102,184,79,226],[108,187,88,202]];
const recovery=[[108,184,83,218],[124,179,89,202],[143,171,112,200],[161,165,144,210],[167,175,174,220],[160,185,174,236]];
const phases=['右接地','右荷重','右支持・左脚通過','右蹴り出し','左脚を伸ばす','左接地直前','左接地','左荷重','左支持・右脚通過','左蹴り出し','右脚を伸ばす','右接地直前'];
const bounds=[[[78,5,148,250],[367,41,87,188],[605,43,72,199],[823,36,118,194],[1101,36,85,193],[1332,103,150,85]],[[42,267,194,241],[366,298,74,183],[610,298,67,199],[815,292,120,192],[1108,293,75,189],[1337,361,139,79]],[[80,517,150,249],[366,551,88,190],[605,553,74,200],[822,548,119,195],[1103,548,83,194],[1333,616,149,83]],[[49,776,195,245],[366,810,74,183],[607,810,71,199],[816,806,120,189],[1107,803,77,191],[1337,872,139,80]]];
function pose(frame){
frame=((frame%12)+12)%12;const phase=frame%6;
const r=frame<6?rightStance[phase]:recovery[phase],l=frame<6?recovery[phase]:rightStance[phase];
const bob=[0,3,0,-3,-5,-3][phase];
return {frame,label:phases[frame],hip:[128,143+bob],right:{knee:r.slice(0,2),foot:r.slice(2)},left:{knee:l.slice(0,2),foot:l.slice(2)},bob};
}
function draw(ctx,image,athlete,frame){
const p=pose(frame),parts=bounds[athlete],slim=athlete%2? .88:1;
ctx.save();ctx.imageSmoothingEnabled=false;
function piece(part,x,y,w,h){const b=parts[part];ctx.drawImage(image,...b,x,y,w,h);}
function bone(part,a,b,width,skinOnly=false){
const s=parts[part].slice();if(skinOnly){s[0]+=s[2]*.12;s[2]*=.76;s[1]+=s[3]*.39;s[3]*=.61;}
ctx.save();ctx.translate(...a);ctx.rotate(Math.atan2(b[1]-a[1],b[0]-a[0])-Math.PI/2);
ctx.drawImage(image,...s,-width/2,-5,width,Math.hypot(b[0]-a[0],b[1]-a[1])+10);ctx.restore();
}
function leg(which){
const leg=p[which],foot=leg.foot,ankle=[foot[0],foot[1]-9];
bone(3,p.hip,leg.knee,42*slim,true);bone(4,leg.knee,ankle,26*slim);
piece(5,foot[0]-10,foot[1]-19,38*slim,20);
}
const swing=(p.right.foot[0]-p.left.foot[0])*.42;
function arm(near){
const direction=near?-1:1,shoulder=[near?117:142,88+p.bob];
const elbow=[126+direction*swing,120+p.bob],hand=[147+direction*swing,102+p.bob];
bone(1,shoulder,elbow,26*slim);bone(2,elbow,hand,22*slim);
}
// Stable occlusion is essential: left (far) limbs first, right (near) limbs last.
ctx.filter='brightness(0.78)';arm(false);leg('left');ctx.filter='none';
leg('right');
const b=parts[0],scale=.52,anchorX=[148,144,145,144][athlete];
piece(0,p.hip[0]+(b[0]-anchorX)*scale,p.hip[1]+(b[1]-athlete*256-225)*scale,b[2]*scale,b[3]*scale);
arm(true);ctx.restore();
}
function build(image,athlete){
const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=512;
const ctx=canvas.getContext('2d');
for(let frame=0;frame<12;frame++){ctx.save();ctx.translate(frame%6*256,Math.floor(frame/6)*256);draw(ctx,image,athlete,frame);ctx.restore();}
return canvas;
}
root.RunRig={pose,draw,build,phases};
})(typeof window==='undefined'?globalThis:window);
