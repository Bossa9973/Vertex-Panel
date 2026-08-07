import http from '@/api/http'

const deleteCoterm = (id: number | string) => http.delete(`/api/admin/coterms/${id}`)

export default deleteCoterm