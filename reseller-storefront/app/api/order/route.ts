import { NextRequest, NextResponse } from 'next/server'

const VERTEX_URL     = process.env.VERTEX_API_URL   || ''
const RESELLER_TOKEN = process.env.RESELLER_TOKEN   || ''
const PANEL_URL      = process.env.NEXT_PUBLIC_PANEL_URL || ''

export async function POST(req: NextRequest) {
  if (!VERTEX_URL || !RESELLER_TOKEN) {
    return NextResponse.json({ message: 'Storefront not configured.' }, { status: 503 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ message: 'Invalid request body.' }, { status: 400 })
  }

  // Build success/cancel redirect URLs back to the storefront
  const host = req.headers.get('host') || PANEL_URL
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const baseUrl = `${protocol}://${host}`

  try {
    const res = await fetch(`${VERTEX_URL}/api/client/reseller/store/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Reseller-Token': RESELLER_TOKEN,
      },
      body: JSON.stringify({
        ...body,
        success_url: `${baseUrl}/?status=success&link_uuid={link_uuid}`,
        cancel_url:  `${baseUrl}/?status=cancelled`,
      }),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ message: data.message || `Error ${res.status}` }, { status: res.status })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ message: e.message || 'Failed to create order.' }, { status: 502 })
  }
}
