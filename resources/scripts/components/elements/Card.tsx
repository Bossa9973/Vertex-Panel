import styled from '@emotion/styled'
import tw from 'twin.macro'

interface Props {
    overridePadding?: boolean
}

const Card = styled.div<Props>`
    ${tw`border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 text-slate-900 dark:text-white rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-2xl dark:shadow-black/60 backdrop-blur-xl transition-all font-sans hover:border-slate-300 dark:hover:border-white/20`}

    ${props => !props.overridePadding && tw`p-6`}
`

export default Card
