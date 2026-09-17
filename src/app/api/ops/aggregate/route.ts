import { NextResponse } from 'next/server';
import { ChargebeeService } from '@/lib/services/ChargebeeService';
import { CommerceService } from '@/lib/services/CommerceService';
import { ThingSpaceService } from '@/lib/services/ThingSpaceService';
import { FreeScoutService } from '@/lib/services/FreeScoutService';
import { StripeExplorerService } from '@/lib/services/StripeExplorerService';
import { verifyAuth } from '@/lib/auth';
import { queryOpsDb, logActivity } from '@/lib/opsDb';

export async function GET(request: Request) {
  try {
    // 1. Authenticate Request
    const session = await verifyAuth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized NOC Access' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email parameter required' }, { status: 400 });
    }

    await logActivity(session.email, 'search_unique_customer', email, request);

    // Initialize Services
    const chargebee = new ChargebeeService();
    const commerce = new CommerceService();
    const thingspace = new ThingSpaceService();

    // 2. Fetch Base Aggregation (Parallel)
    const [cbData, commerceOrders] = await Promise.all([
      chargebee.getCustomerData(email),
      commerce.getCustomerOrders(email)
    ]);

    // 3. Extract ICCIDs for ThingSpace Synchronization
    const iccidsToFetch = new Set<string>();

    // Extract from Commerce Orders
    commerceOrders?.forEach(order => {
      if (order.iccid) iccidsToFetch.add(order.iccid);
    });

    // Extract from Chargebee Subscriptions (from custom fields if they exist)
    cbData?.customers?.forEach(cust => {
      cust.subscriptions?.forEach((sub: any) => {
        const iccid = sub.cf_SIM_ID_ICCID || sub.cf_iccid;
        if (iccid) iccidsToFetch.add(iccid);
      });
    });

    // 4. Fetch ThingSpace Device Details (Parallel)
    const thingspacePayload: Record<string, any> = {};
    if (iccidsToFetch.size > 0 && thingspace.isConfigured()) {
      const tsPromises = Array.from(iccidsToFetch).map(async (iccid) => {
        const device = await thingspace.getDeviceDetails(iccid);
        if (device) {
          thingspacePayload[iccid] = device;
        }
      });
      await Promise.all(tsPromises);
    }

    // Fetch recent invoices and transactions for each customer to support grace period logic
    const invoicesPayload: Record<string, any[]> = {};
    const transactionsPayload: Record<string, any[]> = {};
    if (cbData?.customers && cbData.customers.length > 0) {
      const billingPromises = cbData.customers.map(async (cust) => {
        const invs = await chargebee.getInvoices(cust.id);
        if (invs && invs.length > 0) {
          invoicesPayload[cust.id] = invs;
        }

        const cbExtended = chargebee as any;
        const txRes = await cbExtended.fetchApi(`/transactions?customer_id[is]=${cust.id}&limit=40`);
        if (txRes && txRes.list && txRes.list.length > 0) {
          transactionsPayload[cust.id] = txRes.list.map((t: any) => t.transaction);
        }
      });
      await Promise.all(billingPromises);
    }

    // 5. Build Unified Payload
    let freescoutPayload: any[] = [];
    const fs = new FreeScoutService();
    try {
      const custData = await fs.fetchApi(`customers?email=${encodeURIComponent(email)}`);
      if (custData && custData._embedded?.customers?.length > 0) {
        const customerId = custData._embedded.customers[0].id;
        const convoData = await fs.fetchApi(`conversations?customerId=${customerId}`);
        if (convoData && convoData._embedded?.conversations) {
          freescoutPayload = convoData._embedded.conversations;
        }
      }
    } catch (e: any) {
      console.log('Failed to fetch FreeScout telemetry:', e.message);
    }

    let stripeCustomers: any[] = [];
    try {
      const stripe = new StripeExplorerService();
      if (stripe.isConfigured()) {
        stripeCustomers = await stripe.searchCustomersByEmail(email);
      }
    } catch (e: any) {
      console.log('Failed to fetch Stripe initial payload:', e.message);
    }

    return NextResponse.json({
      success: true,
      data: {
        email: email,
        chargebee: cbData?.customers || [],
        invoices: invoicesPayload,
        transactions: transactionsPayload,
        commerce: commerceOrders || [],
        thingspace: thingspacePayload,
        freescout: freescoutPayload,
        stripeCustomers: stripeCustomers,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err: any) {
    console.error('Ops Aggregation Error:', err.message);
    return NextResponse.json({ error: 'NOC Aggregation Cluster Error' }, { status: 500 });
  }
}
