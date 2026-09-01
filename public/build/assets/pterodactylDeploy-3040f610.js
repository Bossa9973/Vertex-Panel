import{h as a}from"./main-37b58d37.js";const p=t=>a.post("/api/client/deploy/pterodactyl",t).then(e=>e.data),r=t=>a.get(`/api/client/deploy/pterodactyl/${t}`).then(e=>e.data);export{r as g,p as s};
