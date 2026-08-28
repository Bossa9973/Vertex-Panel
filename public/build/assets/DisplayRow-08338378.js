import{E as o}from"./main-d71a8882.js";const r=o.div`
    ${{display:"flex",flexDirection:"column",gap:"1rem",borderRadius:"5px",borderWidth:"1px",borderColor:"var(--color-accent-2)",backgroundColor:"var(--color-background)",padding:"1rem","@media (min-width: 768px)":{flexDirection:"row"}}}

    & > div {
        ${{borderTopWidth:"1px",borderColor:"var(--color-accent-2)",paddingTop:"1rem","@media (min-width: 768px)":{borderTopWidth:"0px",paddingTop:"0px"}}}
    }

    & > div:is(:first-of-type) {
        ${{borderTopWidth:"0px",paddingTop:"0px"}}
    }
`,d=o.div`
    ${{display:"flex",flexDirection:"column"}}

    & > div {
        ${{borderRadius:"0px"}}
    }

    & > div:is(:first-of-type) {
        ${{borderTopLeftRadius:"5px",borderTopRightRadius:"5px"}}
    }

    & > div:not(:first-of-type) {
        ${{marginTop:"-1px"}}
    }

    & > div:is(:last-child) {
        ${{borderBottomRightRadius:"5px",borderBottomLeftRadius:"5px"}}
    }
`,p={Row:r,Group:d};export{p as D};
