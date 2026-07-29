import styled from '@emotion/styled'
import { Menu as MantineMenu, MenuItemProps, MenuProps } from '@mantine/core'
import { FC, MouseEventHandler } from 'react'
import tw from 'twin.macro'

interface Menu extends FC<MenuProps> {
    Dropdown: typeof StyledMenuDropdown
    Target: typeof MantineMenu.Target
    Divider: typeof StyledDivider
    Item: typeof StyledMenuItem
}

const StyledMenuDropdown = styled(MantineMenu.Dropdown)`
    &.mantine-Menu-dropdown {
        ${tw`p-2 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-2xl border border-slate-200/80 dark:border-white/20 rounded-2xl shadow-2xl text-slate-900 dark:text-stone-100 font-sans z-[9999]`}
    }
`

const StyledMenuItem = styled(MantineMenu.Item)<
    MenuItemProps & {
        onClick?: MouseEventHandler<HTMLButtonElement>
        disabled?: boolean
    }
>`
    &.mantine-Menu-item {
        ${tw`w-full text-left px-3 py-2.5 h-auto rounded-xl bg-transparent transition-all duration-200 cursor-pointer font-sans font-semibold text-xs tracking-tight flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed`}

        ${({ color }) =>
            color === 'red'
                ? tw`text-rose-500 dark:text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 hover:text-rose-600 dark:hover:text-rose-300 active:scale-95`
                : tw`text-slate-800 dark:text-stone-200 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white active:scale-95`}
    }

    &.mantine-Menu-item .mantine-Menu-itemIcon {
        ${tw`mr-0`}
    }
`

const StyledDivider = styled(MantineMenu.Divider)`
    ${tw`my-1.5 mx-auto w-[94%] border-t border-slate-200/80 dark:border-white/10`}
`

const Menu: Menu = props => (
    <MantineMenu withinPortal zIndex={9999} {...props} />
)

Menu.Dropdown = StyledMenuDropdown
Menu.Target = MantineMenu.Target
Menu.Divider = StyledDivider
Menu.Item = StyledMenuItem

export default Menu
