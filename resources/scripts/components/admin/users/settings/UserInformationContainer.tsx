import { useFlashKey } from '@/util/useFlash'
import { FormikProvider, useFormik } from 'formik'
import * as yup from 'yup'

import updateUser from '@/api/admin/users/updateUser'
import useUserSWR from '@/api/admin/users/useUserSWR'

import Button from '@/components/elements/Button'
import FlashMessageRender from '@/components/elements/FlashMessageRenderer'
import FormCard from '@/components/elements/FormCard'
import CheckboxFormik from '@/components/elements/formik/CheckboxFormik'
import TextInputFormik from '@/components/elements/formik/TextInputFormik'
import { AwardBadge } from '@/components/ui/award-badge'

const UserInformationContainer = () => {
    const { data: user, mutate } = useUserSWR()
    const { clearFlashes, clearAndAddHttpError } = useFlashKey(
        'admin:user:settings:general'
    )

    const form = useFormik({
        enableReinitialize: true,
        initialValues: {
            name: user.name,
            email: user.email,
            password: '',
            rootAdmin: user.rootAdmin,
        },
        validationSchema: yup.object({
            name: yup
                .string()
                .max(191, 'Do not exceed 191 characters')
                .required('A name is required.'),
            email: yup
                .string()
                .email('Enter a valid email address')
                .required('An email address is required.'),
            password: yup
                .string()
                .matches(
                    /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])(?=.{8,})/,
                    'Must Contain 8 Characters, One Uppercase, One Lowercase, One Number and One Special Case Character'
                )
                .optional(),
            rootAdmin: yup.boolean(),
        }),
        onSubmit: async ({ password, ...values }) => {
            clearFlashes()
            try {
                const updatedUser = await updateUser(user.id, {
                    ...values,
                    password: password.length > 0 ? password : null,
                })

                mutate(updatedUser, false)
            } catch (e) {
                clearAndAddHttpError(e as Error)
            }
        },
    })

    return (
        <FormCard className='w-full'>
            <FormikProvider value={form}>
                <form onSubmit={form.handleSubmit}>
                    <FormCard.Body>
                        <FormCard.Title>User Information</FormCard.Title>
                        <div className='space-y-3 mt-3'>
                            <FlashMessageRender byKey='admin:user:settings:general' />
                            <TextInputFormik name='name' label='Name' />
                            <TextInputFormik name='email' label='Email' />
                            <TextInputFormik
                                name='password'
                                label='Password'
                                placeholder={'Override password'}
                            />
                            <CheckboxFormik
                                name={'rootAdmin'}
                                label={'Administrator'}
                                className={'mt-3'}
                            />
                            {form.values.rootAdmin && (
                                <div className='mt-4 p-3 bg-neutral-950/80 border border-amber-500/20 rounded-xl space-y-2'>
                                    <span className='text-xs font-bold text-amber-400 block'>Vertex Staff Designation</span>
                                    <AwardBadge titleText='Certified Vertex Staff Member' subTitleText='VERTEX CLOUD' />
                                </div>
                            )}
                        </div>
                    </FormCard.Body>
                    <FormCard.Footer>
                        <Button
                            loading={form.isSubmitting}
                            disabled={!form.dirty}
                            type='submit'
                            variant='filled'
                            color='success'
                            size='sm'
                        >
                            Save
                        </Button>
                    </FormCard.Footer>
                </form>
            </FormikProvider>
        </FormCard>
    )
}

export default UserInformationContainer