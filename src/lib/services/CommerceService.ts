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
  fulfillmentStatus: string | null;
}

export interface UnifiedOrder {
  source: 'shopify' | 'both' | 'shipstation';
  orderNumber: string;
  orderId: string;
  orderDate: string;
  status: string;
  fulfillmentStatus: string | null;
  total: number;
  currency: string;
  paymentStatus: string;
  items: UnifiedOrderItem[];
  shipping: any;
  tracking: UnifiedTracking[];
  imei: string | null;
  iccid: string | null;
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
    return Boolean(this.shopifyToken && this.ssAuth !== 'Basic Ogo=');
  }

  async getCustomerOrders(email: string): Promise<UnifiedOrder[]> {
    if (!this.isConfigured()) return [];

    const shopRes = await fetch(`https://${this.shopifyDomain}/admin/api/2024-01/orders.json?status=any&email=${encodeURIComponent(email)}&limit=250`, {
      headers: {
        'X-Shopify-Access-Token': this.shopifyToken,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    if (!shopRes.ok) return [];
    
    const shopData = await shopRes.json();
    // Strictly filter out any orders Shopify returned that don't match the email
    const rawShopifyOrders = shopData.orders || [];
    const shopifyOrders = rawShopifyOrders.filter((o: any) => 
       o.email && o.email.toLowerCase() === email.toLowerCase()
    );

    const unifiedOrders: UnifiedOrder[] = [];
    const processLimit = Math.min(shopifyOrders.length, 20);

    for (let i = 0; i < shopifyOrders.length; i++) {
       const o = shopifyOrders[i];
       const orderNumber = String(o.name).replace('#', '');
       
       let source: 'shopify' | 'both' = 'shopify';
       let ssOrder: any = null;
       
       if (i < processLimit) {
         try {
           const ssRes = await fetch(`https://ssapi.shipstation.com/orders?orderNumber=${encodeURIComponent(orderNumber)}`, {
             headers: {
               'Authorization': this.ssAuth,
               'Content-Type': 'application/json'
             },
             cache: 'no-store'
           });
           if (ssRes.ok) {
             const ssData = await ssRes.json();
             if (ssData.orders && ssData.orders.length > 0) {
               // Strictly match ShipStation order to the requested email to prevent collision
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

       const trackingMap = new Map<string, UnifiedTracking>();
       
       if (o.fulfillments && o.fulfillments.length > 0) {
         o.fulfillments.forEach((f: any) => {
            if (f.tracking_number) {
               trackingMap.set(f.tracking_number, {
                  carrier: f.tracking_company || 'Unknown',
                  trackingNumber: f.tracking_number,
                  trackingUrl: f.tracking_url,
                  shipDate: f.created_at,
                  status: f.status
               });
            }
         });
       }

       if (ssOrder && ssOrder.shipments && ssOrder.shipments.length > 0) {
         ssOrder.shipments.forEach((s: any) => {
            if (s.trackingNumber && !s.voided && !trackingMap.has(s.trackingNumber)) {
               // Hardcode basic URL gen
               let url = null;
               if (String(s.carrierCode).toLowerCase().includes('ups')) url = `https://www.ups.com/track?tracknum=${s.trackingNumber}`;
               if (String(s.carrierCode).toLowerCase().includes('usps')) url = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${s.trackingNumber}`;
               
               trackingMap.set(s.trackingNumber, {
                  carrier: s.carrierCode || 'Unknown',
                  trackingNumber: s.trackingNumber,
                  trackingUrl: url,
                  shipDate: s.shipDate,
                  status: 'shipped'
               });
            }
         });
       }

       unifiedOrders.push({
          source,
          orderNumber: o.name,
          orderId: String(o.id),
          orderDate: o.created_at,
          status: ssOrder ? ssOrder.orderStatus : 'unknown',
          fulfillmentStatus: o.fulfillment_status,
          total: parseFloat(o.total_price),
          currency: o.currency,
          paymentStatus: o.financial_status,
          items: (o.line_items || []).map((li: any) => ({
             name: li.name,
             sku: li.sku,
             quantity: li.quantity,
             price: parseFloat(li.price),
             fulfillmentStatus: li.fulfillment_status
          })),
          shipping: {
             name: (o.shipping_address?.first_name || '') + ' ' + (o.shipping_address?.last_name || ''),
             address1: o.shipping_address?.address1,
             city: o.shipping_address?.city,
             state: o.shipping_address?.province,
             zip: o.shipping_address?.zip,
             country: o.shipping_address?.country
          },
          tracking: Array.from(trackingMap.values()),
          imei: ssOrder?.advancedOptions?.customField1 || null,
          iccid: ssOrder?.advancedOptions?.customField2 || null
       });
    }

    return unifiedOrders;
  }
}
