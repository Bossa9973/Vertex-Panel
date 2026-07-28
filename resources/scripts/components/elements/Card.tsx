import styled from '@emotion/styled'
import tw from 'twin.macro'

interface Props {
    overridePadding?: boolean
}

const Card = styled.div<Props>`
    ${tw`border border-white/[0.08] bg-gradient-to-b from-[#141619] via-[#121417] to-[#0c0d10] text-slate-100 rounded-2xl shadow-2xl shadow-black/60 backdrop-blur-md transition-all font-sans`}

    ${props => !props.overridePadding && tw`p-6`}
`

export default Card
