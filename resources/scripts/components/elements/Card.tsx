import styled from '@emotion/styled'
import tw from 'twin.macro'

interface Props {
    overridePadding?: boolean
}

const Card = styled.div<Props>`
    ${tw`border border-white/10 bg-neutral-900/70 text-white rounded-2xl shadow-2xl shadow-black/60 backdrop-blur-xl transition-all font-sans hover:border-white/20`}

    ${props => !props.overridePadding && tw`p-6`}
`

export default Card
