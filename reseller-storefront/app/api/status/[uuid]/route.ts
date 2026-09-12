import { NextRequest, NextResponse } from 'next/server'

const VERTEX_URL     = process.env.VERTEX_API_URL || ''
const RESELLER_TOKEN = process.env.RESELLER_TOKEN || ''

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params

  if (!uuid || !VERTEX_URL) {
    return NextResponse.json({ message: 'Missing parameters.' }, { status: 400 })
  }

  try {
    const res = await fetch(`${VERTEX_URL}/api/client/pay/${uuid}/status`, {
      headers: {
        'Accept': 'application/json',
        'X-Reseller-Token': RESELLER_TOKEN,
      },
      // No caching — this needs to be fresh every poll
      cache: 'no-store',
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ message: data.message || `Error ${res.status}` }, { status: res.status })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ message: e.message || 'Status check failed.' }, { status: 502 })
  }
}
