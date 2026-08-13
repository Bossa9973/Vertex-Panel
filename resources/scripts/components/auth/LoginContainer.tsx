import login from '@/api/auth/login'
import { SignInPage, Testimonial } from '@/components/ui/sign-in'
import { useFlashKey } from '@/util/useFlash'
import { useStoreState } from '@/state'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const sampleTestimonials: Testimonial[] = [
  {
    avatarSrc: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    name: "Alex Rivera",
    handle: "@alexcloud",
    text: "Vertex panel makes managing our KVM clusters effortless. Ultra fast deployment and intuitive interface!"
  },
  {
    avatarSrc: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    name: "Marcus Chen",
    handle: "@marcustech",
    text: "The BOLTs credit system and instant VPS provisioning are top notch. Highly recommended!"
  },
];

const LoginContainer = () => {
    const { clearFlashes, clearAndAddHttpError } = useFlashKey('auth:sign_in')
    const flashes = useStoreState(state => state.flashes.items)
    const location = useLocation()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | undefined>()

    useEffect(() => {
        document.title = 'Sign In | Vertex'
    }, [])

    useEffect(() => {
        const authFlashes = flashes.filter(f => f.key === 'auth:sign_in')
        if (authFlashes && authFlashes.length > 0) {
            setErrorMessage(authFlashes[0].message)
        }
        const params = new URLSearchParams(location.search)
        const errorParam = params.get('error')
        if (errorParam) {
            setErrorMessage(errorParam)
        }
    }, [flashes, location.search])

    const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        clearFlashes()
        setErrorMessage(undefined)
        setLoading(true)

        const formData = new FormData(event.currentTarget)
        const email = formData.get('email') as string
        const password = formData.get('password') as string

        try {
            await login({ email, password })
            window.location.href = location.state?.from?.pathname || '/'
        } catch (e: any) {
            console.error(e)
            setLoading(false)
            const msg = e.response?.data?.message || e.message || 'Invalid login credentials'
            setErrorMessage(msg)
            clearAndAddHttpError(e)
        }
    }

    const handleGoogleSignIn = () => {
        window.location.href = '/auth/social/google/redirect'
    }

    const handleCreateAccount = () => {
        navigate('/auth/register')
    }

    return (
        <SignInPage
            title={<span className="font-bold text-white tracking-tight">Sign In to Vertex</span>}
            description="Access your KVM server infrastructure and billing client area."
            heroImageSrc="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=2160&q=80"
            testimonials={sampleTestimonials}
            onSignIn={handleSignIn}
            onGoogleSignIn={handleGoogleSignIn}
            onCreateAccount={handleCreateAccount}
            loading={loading}
            error={errorMessage}
        />
    )
}

export default LoginContainer