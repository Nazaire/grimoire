/**
 * An interface is the contract two implementations share. Stripe and Flex
 * both charge; the facade talks to PaymentProvider, not a class. Implementers
 * inherit the signature — they do not repeat the return type. One OrderService
 * is not this: do not invent IOrderService in front of it.
 */

import { type CodedUnion } from '../coded-error/coded-error';
import { failureCode, success, type Result } from '../result/result';

export interface PaymentProvider {
  readonly vendor: 'stripe' | 'flex';
  charge(id: string): Promise<Result<{ id: string }, CodedUnion<'card_declined' | 'service_failed'>>>;
}

export class StripePaymentProvider implements PaymentProvider {
  readonly vendor = 'stripe' as const;

  async charge(id: string) {
    // no return type — the interface is the contract
    if (!id) return failureCode('card_declined');
    return success({ id });
  }
}

export class FlexPaymentProvider implements PaymentProvider {
  readonly vendor = 'flex' as const;

  async charge(id: string) {
    if (!id) return failureCode('service_failed');
    return success({ id });
  }
}

export class PaymentProviderService {
  constructor(
    private readonly stripe: StripePaymentProvider,
    private readonly flex: FlexPaymentProvider,
  ) {
    this.byVendor.set(stripe.vendor, stripe);
    this.byVendor.set(flex.vendor, flex);
  }

  private readonly byVendor = new Map<PaymentProvider['vendor'], PaymentProvider>();

  charge(vendor: PaymentProvider['vendor'], id: string) {
    const provider = this.byVendor.get(vendor);
    if (!provider) return failureCode('unsupported_vendor');
    return provider.charge(id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export interface IOrderService {
  markPaid(id: string): Promise<Result<{ id: string }, CodedUnion<'order_not_found'>>>;
}

export class OrderService implements IOrderService {
  async markPaid(id: string): Promise<Result<{ id: string }, CodedUnion<'order_not_found'>>> {
    // ✗ one implementation — the class was already the type
    return success({ id });
  }
}

export class StripeRepeatsTheContract implements PaymentProvider {
  readonly vendor = 'stripe' as const;

  async charge(id: string): Promise<Result<{ id: string }, CodedUnion<'card_declined' | 'service_failed'>>> {
    // ✗ repeating the return type on the impl; inherit it
    return success({ id });
  }
}
