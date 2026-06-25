import { getSetting } from '../db';

export interface UnifiedTracking {
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  shipDate: string | null;
  status: string;
}

export interface UnifiedOrderItem {
  name: string;
  sku: string;
  quantity: number;
  price: number;
  compareAtPrice: number | null;
  totalDiscount: number;
  fulfillmentStatus: string | null;
  vendor: string | null;
  requiresShipping: boolean;
  variantTitle: string | null;
  grams: number;
}

export interface UnifiedAddress {
  name: string;
  company: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  countryCode: string | null;
}

export interface UnifiedOrder {
  source: 'shopify' | 'both' | 'shipstation';
  orderNumber: string;
  orderId: string;
  orderDate: string;
  status: string;
  fulfillmentStatus: string | null;
  // Financials
  total: number;
  subtotal: number;
  totalTax: number;
  totalDiscounts: number;
  totalShippingPrice: number;
  currency: string;
  paymentStatus: string;
  paymentGateway: string | null;
  // Customer
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  // Addresses
  shippingAddress: UnifiedAddress;
  billingAddress: UnifiedAddress | null;
  // Line items
  items: UnifiedOrderItem[];
  // Discount codes
  discountCodes: { code: string; amount: string; type: string }[];
  // Shipment
  tracking: UnifiedTracking[];
  shippingMethod: string | null;
  // Notes & tags
  note: string | null;
  tags: string | null;
  // Device fields (from ShipStation custom fields)
  imei: string | null;
  iccid: string | null;
  // Refund summary
  refunded: boolean;
  totalRefunded: number;
}

export class CommerceService {
  private shopifyToken: string;
  private shopifyDomain: string;
  private ssAuth: string;

  constructor() {
    this.shopifyToken = getSetting('shopify_admin_key') || '';
    this.shopifyDomain = getSetting('shopify_store_domain') || 'nomadinternet.myshopify.com';
    const ssKey = getSetting('shipstation_api_key') || '';
    const ssSec = getSetting('shipstation_api_secret') || '';
    this.ssAuth = 'Basic ' + Buffer.from(`${ssKey}:${ssSec}`).toString('base64');
  }

  isConfigured(): boolean {
    return Boolean(this.shopifyToken);
  }

  async getCustomerOrders(email: string): Promise<UnifiedOrder[]> {
    if (!this.isConfigured()) return [];

    const shopRes = await fetch(
      `https://${this.shopifyDomain}/admin/api/2024-01/orders.json?status=any&email=${encodeURIComponent(email)}&limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': this.shopifyToken,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (!shopRes.ok) return [];

    const shopData = await shopRes.json();
    const rawShopifyOrders = shopData.orders || [];
    const shopifyOrders = rawShopifyOrders.filter((o: any) =>
      o.email && o.email.toLowerCase() === email.toLowerCase()
    );

    const unifiedOrders: UnifiedOrder[] = [];
    const hasShipStation = this.ssAuth !== 'Basic Ogo=';
    const processLimit = hasShipStation ? Math.min(shopifyOrders.length, 20) : 0;

    for (let i = 0; i < shopifyOrders.length; i++) {
      const o = shopifyOrders[i];
      const orderNumber = String(o.name).replace('#', '');

      let source: 'shopify' | 'both' = 'shopify';
      let ssOrder: any = null;

      if (i < processLimit) {
        try {
          const ssRes = await fetch(
            `https://ssapi.shipstation.com/orders?orderNumber=${encodeURIComponent(orderNumber)}`,
            {
              headers: { 'Authorization': this.ssAuth, 'Content-Type': 'application/json' },
              cache: 'no-store',
            }
          );
          if (ssRes.ok) {
            const ssData = await ssRes.json();
            if (ssData.orders && ssData.orders.length > 0) {
              const matched = ssData.orders.find((x: any) =>
                x.customerEmail && x.customerEmail.toLowerCase() === email.toLowerCase()
              );
              if (matched) {
                ssOrder = matched;
                source = 'both';
              }
            }
          }
        } catch (e) {
          console.error('ShipStation error for order', orderNumber, e);
        }
      }

      // ── Tracking ────────────────────────────────────────────────────────────
      const trackingMap = new Map<string, UnifiedTracking>();
      if (o.fulfillments?.length > 0) {
        o.fulfillments.forEach((f: any) => {
          if (f.tracking_number) {
            trackingMap.set(f.tracking_number, {
              carrier: f.tracking_company || 'Unknown',
              trackingNumber: f.tracking_number,
              trackingUrl: f.tracking_url,
              shipDate: f.created_at,
              status: f.status,
            });
          }
        });
      }
      if (ssOrder?.shipments?.length > 0) {
        ssOrder.shipments.forEach((s: any) => {
          if (s.trackingNumber && !s.voided && !trackingMap.has(s.trackingNumber)) {
            let url: string | null = null;
            if (String(s.carrierCode).toLowerCase().includes('ups')) url = `https://www.ups.com/track?tracknum=${s.trackingNumber}`;
            if (String(s.carrierCode).toLowerCase().includes('usps')) url = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${s.trackingNumber}`;
            if (String(s.carrierCode).toLowerCase().includes('fedex')) url = `https://www.fedex.com/fedextrack/?trknbr=${s.trackingNumber}`;
            trackingMap.set(s.trackingNumber, {
              carrier: s.carrierCode || 'Unknown',
              trackingNumber: s.trackingNumber,
              trackingUrl: url,
              shipDate: s.shipDate,
              status: 'shipped',
            });
          }
        });
      }

      // ── Address helper ─────────────────────────────────────────────────────
      const mapAddr = (a: any): UnifiedAddress => ({
        name: a ? `${a.first_name || ''} ${a.last_name || ''}`.trim() : '',
        company: a?.company || null,
        phone: a?.phone || null,
        address1: a?.address1 || null,
        address2: a?.address2 || null,
        city: a?.city || null,
        state: a?.province || null,
        zip: a?.zip || null,
        country: a?.country || null,
        countryCode: a?.country_code || null,
      });

      // ── Refunds ───────────────────────────────────────────────────────────
      const refunds: any[] = o.refunds || [];
      const totalRefunded = refunds.reduce((sum: number, r: any) => {
        const txns: any[] = r.transactions || [];
        return sum + txns.reduce((s2: number, t: any) => s2 + parseFloat(t.amount || '0'), 0);
      }, 0);

      // ── Shipping method ────────────────────────────────────────────────────
      const shippingLine = (o.shipping_lines || [])[0];
      const shippingMethod = shippingLine?.title || null;
      const totalShippingPrice = parseFloat(shippingLine?.price || '0');

      unifiedOrders.push({
        source,
        orderNumber: o.name,
        orderId: String(o.id),
        orderDate: o.created_at,
        status: ssOrder ? ssOrder.orderStatus : (o.closed_at ? 'closed' : 'open'),
        fulfillmentStatus: o.fulfillment_status,
        // Financials
        total: parseFloat(o.total_price || '0'),
        subtotal: parseFloat(o.subtotal_price || '0'),
        totalTax: parseFloat(o.total_tax || '0'),
        totalDiscounts: parseFloat(o.total_discounts || '0'),
        totalShippingPrice,
        currency: o.currency,
        paymentStatus: o.financial_status,
        paymentGateway: o.gateway || null,
        // Customer
        customerName: `${o.customer?.first_name || ''} ${o.customer?.last_name || ''}`.trim(),
        customerEmail: o.customer?.email || o.email || null,
        customerPhone: o.customer?.phone || o.billing_address?.phone || null,
        // Addresses
        shippingAddress: mapAddr(o.shipping_address),
        billingAddress: o.billing_address ? mapAddr(o.billing_address) : null,
        // Items
        items: (o.line_items || []).map((li: any) => ({
          name: li.name,
          sku: li.sku || '',
          quantity: li.quantity,
          price: parseFloat(li.price || '0'),
          compareAtPrice: li.compare_at_price != null ? parseFloat(li.compare_at_price) : null,
          totalDiscount: parseFloat(li.total_discount || '0'),
          fulfillmentStatus: li.fulfillment_status,
          vendor: li.vendor || null,
          requiresShipping: li.requires_shipping,
          variantTitle: li.variant_title || null,
          grams: li.grams || 0,
        })),
        // Discounts
        discountCodes: (o.discount_codes || []).map((d: any) => ({
          code: d.code,
          amount: d.amount,
          type: d.type,
        })),
        tracking: Array.from(trackingMap.values()),
        shippingMethod,
        note: o.note || null,
        tags: o.tags || null,
        imei: ssOrder?.advancedOptions?.customField1 || null,
        iccid: ssOrder?.advancedOptions?.customField2 || null,
        refunded: totalRefunded > 0,
        totalRefunded,
      });
    }

    return unifiedOrders;
  }
}
