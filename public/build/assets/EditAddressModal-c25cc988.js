import{h as P,q as _,F as E}from"./main-52adaac0.js";import{r as A,L as a,bR as M,X as v,bI as j,aH as G,M as p,aI as V}from"./vendor-react-76e6893f.js";import{u as k}from"./useFlash-2b3ff4db.js";import{i as R,m as q}from"./validation-d9b57f25.js";import{o as H,e as L,p as w,n as x,l as F,f as N,t as B,T as y}from"./TextInputForm-f490faf5.js";import{M as n}from"./Modal-5043a0e3.js";import{n as D}from"./vendor-motion-charts-05d56cec.js";import{n as T,g as K}from"./vendor-mantine-9ff60707.js";import{u as Q}from"./useServersSWR-73b5e7ac.js";import{S as W}from"./SelectForm-b1cac659.js";const X=D(T)`
    & .mantine-Radio-radio {
        ${{height:"1rem",width:"1rem",borderColor:"var(--color-accent-5)",backgroundColor:"transparent"}}
    }

    & .mantine-Radio-inner {
        ${{alignSelf:"center"}}
    }

    & .mantine-Radio-body {
        ${{alignItems:"center"}}
    }

    & .mantine-Radio-radio:checked {
        ${{borderColor:"var(--color-foreground)"}}
    }

    & .mantine-Radio-label {
        ${{paddingLeft:"0.5rem",color:"var(--color-foreground)"}}
    }

    & .mantine-Radio-icon {
        ${{color:"var(--color-foreground)"}}
    }
`,h=({...e})=>a(X,{...e});h.Group=A.forwardRef(({...e},s)=>a(T.Group,{ref:s,...e}));const z=({control:e,...s})=>{const{field:t,fieldState:{error:r}}=M({name:s.name,control:e});return a(h.Group,{...t,...s,error:r?.message})},J=({addressPoolId:e})=>{const{t:s}=v("admin.servers.index"),{t}=v("admin.addressPools.addresses"),{watch:r}=j(),l=r("serverId"),[i,c]=A.useState(l),[b]=K(i,200),{data:d,isLoading:m,isValidating:f}=Q({addressPoolId:e,query:b,perPage:10}),S=d?.items.map(o=>({value:o.internalId.toString(),label:o.name,description:o.hostname}))??[];return a(W,{label:t("assigned_server"),name:"serverId",data:S,searchable:!0,searchValue:i,onSearchChange:o=>c(o),loading:f||m,nothingFound:s("no_server_found"),clearable:!0})},ne=(e,s)=>P.delete(`/api/admin/address-pools/${e}/addresses/${s}`),O=async(e,s,{macAddress:t,serverId:r,include:l,...i})=>{const{data:{data:c}}=await P.put(`/api/admin/address-pools/${e}/addresses/${s}`,{mac_address:t,server_id:r,...i},{params:{include:l?.join(",")}});return _(c)},ie=({address:e,onClose:s,mutate:t})=>{const{t:r}=v("strings"),{t:l}=v("admin.addressPools.addresses"),{clearFlashes:i,clearAndAddHttpError:c}=k(`admin.addressPools.${e?.addressPoolId}.addresses.${e?.id}.edit`),b=H({address:R().max(191),type:L(["ipv4","ipv6"]),cidr:w(Number,x().int().min(1).max(128)),gateway:R().max(191),macAddress:q().max(191).optional().or(F("")),serverId:F("").or(N()).or(w(Number,x()))}),d=G({resolver:B(b),defaultValues:{address:"",type:"ipv4",cidr:"",gateway:"",macAddress:"",serverId:""}});A.useEffect(()=>{d.reset({address:e?.address??"",type:e?.type??"ipv4",cidr:e?.cidr.toString()??"",gateway:e?.gateway??"",macAddress:e?.macAddress??"",serverId:e?.serverId?.toString()??""})},[e]);const m=()=>{d.reset(),s()},f=async S=>{const{macAddress:o,serverId:I,...C}=S;i();try{const u=await O(e.addressPoolId,e.id,{macAddress:o&&o.length>0?o:null,serverId:I!==""?I:null,include:["server"],...C});t(g=>g&&{pagination:g.pagination,items:g.items.map($=>$.id===u.id?u:$)},!1),m()}catch(u){c(u)}};return p(n,{open:!!e,onClose:m,children:[a(n.Header,{children:a(n.Title,{children:l("edit_modal.title")})}),a(V,{...d,children:p("form",{onSubmit:d.handleSubmit(f),children:[p(n.Body,{children:[a(E,{className:"mb-5",byKey:`admin.addressPools.${e?.addressPoolId}.addresses.${e?.id}.edit`}),a(y,{name:"address",label:r("address_one")}),p(z,{name:"type",orientation:"vertical",spacing:6,children:[a(h,{name:"type",value:"ipv4",label:r("ipv4")}),a(h,{name:"type",value:"ipv6",label:r("ipv6")})]}),a(y,{name:"cidr",label:r("cidr"),placeholder:"24"}),a(y,{name:"gateway",label:r("gateway")}),a(y,{name:"macAddress",label:r("mac_address")}),a(J,{addressPoolId:e?.addressPoolId})]}),p(n.Actions,{children:[a(n.Action,{type:"button",onClick:m,children:r("cancel")}),a(n.Action,{type:"submit",loading:d.formState.isSubmitting,children:r("save")})]})]})})]})};export{ie as E,z as R,J as S,h as a,ne as d};
