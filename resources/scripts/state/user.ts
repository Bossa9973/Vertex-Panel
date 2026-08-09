import { Action, action } from 'easy-peasy'

export interface UserData {
    name: string
    email: string
    credits: number
    rootAdmin: boolean
    root_admin?: boolean
    is_reseller?: boolean
    reseller_plan_type?: 'own_inventory' | 'zero_cost' | null
    createdAt: string
    updatedAt: string
    /** null means full access (CEO / no-role admin); array = role's permission keys */
    adminPermissions: string[] | null
    adminRoleId: number | null
    adminRoleName: string | null
    adminRoleColor: string | null
}

export interface UserStore {
    data?: UserData
    setUserData: Action<UserStore, UserData>
    updateCredits: Action<UserStore, number>
}

const user: UserStore = {
    data: undefined,
    setUserData: action((state, payload) => {
        state.data = payload
    }),
    updateCredits: action((state, payload) => {
        if (state.data) {
            state.data.credits = payload
        }
    }),
}

export default user