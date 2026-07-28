import { Action, action } from 'easy-peasy'

export interface UserData {
    name: string
    email: string
    credits: number
    rootAdmin: boolean
    createdAt: string
    updatedAt: string
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