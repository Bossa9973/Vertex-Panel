import{r as l,b as t,a as e,cS as s}from"./vendor-react-b2e18a0e.js";import{E as a}from"./main-2ed10b43.js";const n=a.div`
    ${{display:"flex",cursor:"pointer",alignItems:"center",justifyContent:"space-between",padding:"0.5rem",":hover":{backgroundColor:"var(--color-accent-2)"}}}

    & .select-item-label {
        ${{fontSize:"0.875rem",lineHeight:"1.25rem",fontWeight:"500",color:"var(--color-accent-5)"}}
    }

    &[data-selected] .select-item-label {
        ${{fontWeight:"500",color:"var(--color-foreground)"}}
    }

    & .select-item-description {
        ${{fontSize:"0.75rem",lineHeight:"1rem",color:"var(--color-accent-4)"}}
    }

    & .select-item-icon {
        ${{display:"none"}}
    }

    &[data-selected] .select-item-icon {
        ${{display:"block"}}
    }
`,f=l.forwardRef(({label:c,description:o,className:m,...r},i)=>t(n,{ref:i,...r,children:[t("div",{children:[e("p",{className:"select-item-label",children:c}),e("p",{className:"select-item-description",children:o})]}),e(s,{className:"h-4 w-4 text-foreground select-item-icon",title:"checked"})]}));export{f as D};
