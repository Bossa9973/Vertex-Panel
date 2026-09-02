import{h as a}from"./main-9025148b.js";const p=t=>a.post("/api/client/deploy/pterodactyl",t).then(e=>e.data),r=t=>a.get(`/api/client/deploy/pterodactyl/${t}`).then(e=>e.data);export{r as g,p as s};
