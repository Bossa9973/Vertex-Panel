import{c4 as c,r as n,L as t,bR as i}from"./vendor-react-76e6893f.js";import{n as d}from"./vendor-motion-charts-05d56cec.js";import{E as s}from"./TextInput-340636b1.js";import{R as m}from"./main-55923f71.js";import{m as h}from"./vendor-mantine-9ff60707.js";const w=d(h)`
    & .mantine-MultiSelect-label {
        ${{marginBottom:"0.25rem",fontSize:"0.75rem",lineHeight:"1rem",fontWeight:"500",color:"var(--color-accent-5)"}}
    }

    & .mantine-MultiSelect-input {
        ${{backgroundColor:"var(--color-background)"}}
        ${({error:r})=>r?{borderColor:"var(--color-error)",color:"var(--color-error)","::placeholder":{color:"var(--color-error-lighter)"}}:{borderColor:"var(--color-accent-2)","::placeholder":{color:"var(--color-accent-4)"},":focus":{borderColor:"var(--color-accent-5)"}}}
    }

    & .mantine-MultiSelect-dropdown {
        ${{borderWidth:"1px",borderColor:"var(--color-accent-2)",backgroundColor:"var(--color-background)","--tw-shadow":"0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)","--tw-shadow-colored":"0 10px 15px -3px var(--tw-shadow-color), 0 4px 6px -4px var(--tw-shadow-color)",boxShadow:"var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",".dark &":{"--tw-shadow":"0 0 #0000","--tw-shadow-colored":"0 0 #0000",boxShadow:"var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)"}}}
    }

    & .mantine-MultiSelect-itemsWrapper {
        ${{padding:"0.5rem"}}
    }

    ${({itemComponent:r})=>r?null:c`
                  & .mantine-MultiSelect-item {
                      ${{display:"flex",height:"3rem",alignItems:"center",paddingLeft:"0.5rem",paddingRight:"0.5rem",color:"var(--color-accent-5)",":hover":{backgroundColor:"var(--color-accent-2)"},"@media (min-width: 640px)":{height:"2.25rem"}}}
                  }
              `}
`,p=n.forwardRef(({loading:r,nothingFound:o,error:e,...a},l)=>t(w,{error:e?t(s,{children:e}):void 0,nothingFound:r?"Loading...":o,rightSection:r&&t(m,{size:4}),ref:l,...a})),b=({control:r,...o})=>{const{field:e,fieldState:{error:a}}=i({name:o.name,control:r});return t(p,{...e,...o,error:a?.message})};export{b as M};
