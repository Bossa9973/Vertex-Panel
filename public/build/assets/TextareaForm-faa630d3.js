import{r as l,a,cH as t}from"./vendor-react-fe1fa568.js";import{E as n}from"./main-ed76df54.js";import{E as d}from"./TextInput-fbcfd031.js";import{T as s}from"./Textarea-b03bffb7.js";const i=n(s)`
    .mantine-Textarea-label {
        ${{marginBottom:"0.25rem",fontSize:"0.75rem",lineHeight:"1rem",fontWeight:"500",color:"var(--color-accent-5)"}}
    }

    .mantine-Textarea-input {
        ${{backgroundColor:"var(--color-background)",":disabled":{backgroundColor:"var(--color-accent-1)",color:"var(--color-accent-5)"},":disabled::placeholder":{color:"var(--color-accent-3)"}}}
        ${({error:r})=>r?{borderColor:"var(--color-error)",color:"var(--color-error)","::placeholder":{color:"var(--color-error-lighter)"}}:{borderColor:"var(--color-accent-2)","::placeholder":{color:"var(--color-accent-4)"},":focus":{borderColor:"var(--color-accent-5)"}}}
    }
`,m=l.forwardRef(({error:r,...o},e)=>a(i,{ref:e,error:r?a(d,{children:r}):void 0,...o})),x=({control:r,...o})=>{const{field:e,fieldState:{error:c}}=t({name:o.name,control:r});return a(m,{...e,...o,error:c?.message})};export{x as T};
