import styled from '@emotion/styled'
import { ReactNode } from 'react'
import tw from 'twin.macro'

interface FormCard
    extends React.FC<{ children: ReactNode; className?: string }> {
    Title: React.FC<{ children: ReactNode }>
    Body: React.FC<{ children: ReactNode }>
    Footer: React.FC<{ children: ReactNode; className?: string }>
}

const FormCard: FormCard = ({ children, className }) => {
    return (
        <div
            className={`rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-neutral-900/70 backdrop-blur-xl shadow-xl shadow-slate-200/50 dark:shadow-black/60 overflow-hidden ${className || ''}`}
        >
            {children}
        </div>
    )
}

FormCard.Title = styled.h4`
    ${tw`text-slate-900 dark:text-white text-xl font-bold tracking-tight`}
`

FormCard.Body = styled.div`
    ${tw`p-6 rounded-t bg-transparent`}
`
FormCard.Footer = styled.div`
    ${tw`px-6 py-4 rounded-b border-t border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-black/40 flex justify-center md:justify-end gap-3`}
`

export default FormCard
