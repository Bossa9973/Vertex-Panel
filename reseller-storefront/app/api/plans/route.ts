import { NextResponse } from 'next/server'

const VERTEX_URL   = process.env.VERTEX_API_URL   || ''
const RESELLER_TOKEN = process.env.RESELLER_TOKEN || ''

export async function GET() {
  if (!VERTEX_URL || !RESELLER_TOKEN) {
    return NextResponse.json(
      { message: 'Storefront not configured. Set VERTEX_API_URL and RESELLER_TOKEN in your environment.' },
      { status: 503 }
    )
  }

  try {
    const res = await fetch(`${VERTEX_URL}/api/client/reseller/store/plans`, {
      headers: {
        'Accept': 'application/json',
        'X-Reseller-Token': RESELLER_TOKEN,
      },
      // Revalidate every 60 seconds (ISR)
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return NextResponse.json(
        { message: body.message || `Vertex API error ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ message: e.message || 'Failed to fetch plans' }, { status: 502 })
  }
}
