import{r as a,L as e,bZ as n,b_ as t}from"./vendor-react-76e6893f.js";import{Q as c}from"./main-52adaac0.js";import{n as l}from"./vendor-motion-charts-05d56cec.js";import{l as d}from"./vendor-mantine-9ff60707.js";const b=l(d)`
    .mantine-Checkbox-body {
        ${{alignItems:"center"}}
    }

    .mantine-Checkbox-inner {
        ${{height:"1rem",width:"1rem"}}
    }

    .mantine-Checkbox-input {
        ${{height:"1rem",width:"1rem",borderRadius:"3px",borderColor:"var(--color-accent-5)",":hover":{borderColor:"var(--color-foreground)"},":active":{backgroundColor:"var(--color-accent-2)"},":disabled":{borderColor:"var(--color-accent-3)",backgroundColor:"var(--color-accent-1)"}}}
    }

    .mantine-Checkbox-input:checked {
        ${{borderColor:"var(--color-foreground)",":disabled":{borderColor:"var(--color-accent-3)",backgroundColor:"var(--color-accent-3)"}}}
        ${({indeterminate:o})=>o?null:{backgroundColor:"var(--color-foreground)"}} ]
    }

    .mantine-Checkbox-label[data-disabled] {
        ${{color:"var(--color-accent-3)"}}
    }

    .mantine-Checkbox-label {
        ${{color:"var(--color-foreground)"}}
    }
`,s=({indeterminate:o,className:r})=>o?e(t,{className:c("stroke-2","stroke-foreground text-foreground",r)}):e(n,{className:c("stroke-2 stroke-background text-background",r)}),u=a.forwardRef((o,r)=>e(b,{ref:r,icon:s,...o}));export{u as C};
