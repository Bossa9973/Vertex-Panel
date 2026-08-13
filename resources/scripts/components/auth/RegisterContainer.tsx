import { useFlashKey } from '@/util/useFlash'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { z } from 'zod'

import register from '@/api/auth/register'

import Button from '@/components/elements/Button'
import TextInputForm from '@/components/elements/forms/TextInputForm'

import LoginFormContainer from '@/components/auth/LoginFormContainer'
import SocialLoginButtons from '@/components/auth/SocialLoginButtons'
import { SparklesIcon } from '@heroicons/react/24/outline'

const RegisterContainer = () => {
    const { t: tAuth } = useTranslation('auth')
    const { t: tStrings } = useTranslation('strings')
    const { clearFlashes, clearAndAddHttpError } = useFlashKey('auth:sign_up')
    const location = useLocation()

    useEffect(() => {
        document.title = 'Create Account | Vertex'
        const params = new URLSearchParams(location.search)
        const errorParam = params.get('error')
        if (errorParam) {
            clearAndAddHttpError(new Error(errorParam))
        }
    }, [location.search])

    const schema = z.object({
        name: z.string().nonempty('Full name is required'),
        email: z.string().email('Please enter a valid email').nonempty(),
        password: z.string().min(8, 'Password must be at least 8 characters'),
        password_confirmation: z.string().min(8, 'Password confirmation must match'),
    }).refine((data) => data.password === data.password_confirmation, {
        message: "Passwords don't match",
        path: ["password_confirmation"],
    })

    const methods = useForm({
        resolver: zodResolver(schema),
        mode: 'onTouched',
        defaultValues: {
            name: '',
            email: '',
            password: '',
            password_confirmation: '',
        },
    })

    const submit = async (data: z.infer<typeof schema>) => {
        clearFlashes()

        try {
            await register(data)
            window.location.href = '/'
        } catch (e) {
            console.error(e)
            clearAndAddHttpError(e as Error)
        }
    }

    return (
        <LoginFormContainer
            title='Create Your Account'
            description='Register for the Vertex Client Area and claim $10.00 in welcome credits.'
            submitting={methods.formState.isSubmitting}
        >
            {/* Welcome Bonus Banner */}
            <div className='mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold'>
                <SparklesIcon className='w-5 h-5 text-emerald-500 shrink-0' />
                <span>Instant $10.00 Welcome Bonus automatically credited to new accounts!</span>
            </div>

            <SocialLoginButtons mode='register' onError={clearAndAddHttpError} />

            <FormProvider {...methods}>
                <form onSubmit={methods.handleSubmit(submit)}>
                    <TextInputForm
                        name={'name'}
                        label='Full Name'
                        autoComplete={'name'}
                        className='mt-1 block w-full'
                        autoFocus
                    />
                    <TextInputForm
                        name={'email'}
                        label='Email Address'
                        autoComplete={'email'}
                        className='mt-3 block w-full'
                    />
                    <TextInputForm
                        name={'password'}
                        label='Password'
                        autoComplete={'new-password'}
                        type='password'
                        className='mt-3 block w-full'
                    />
                    <TextInputForm
                        name={'password_confirmation'}
                        label='Confirm Password'
                        autoComplete={'new-password'}
                        type='password'
                        className='mt-3 block w-full'
                    />
                    <div className='flex items-center justify-between mt-6 pt-3 border-t border-gray-100 dark:border-gray-800/80'>
                        <Link
                            to='/auth/login'
                            className='text-xs font-semibold text-accent-500 hover:text-accent-600 transition'
                        >
                            Already have an account? Sign In
                        </Link>
                        <Button type='submit' variant='filled' color='accent' className='px-6 py-2.5 shadow-md active:scale-[0.98] transition font-bold'>
                            Create Account
                        </Button>
                    </div>
                </form>
            </FormProvider>
        </LoginFormContainer>
    )
}

export default RegisterContainer

