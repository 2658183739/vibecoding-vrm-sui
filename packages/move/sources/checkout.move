module stableflow_checkout::checkout {
    use sui::coin;
    use sui::coin::Coin;
    use sui::event;

    const E_NOT_MERCHANT_OWNER: u64 = 1;
    const E_PRODUCT_INACTIVE: u64 = 2;
    const E_INVOICE_ALREADY_PAID: u64 = 3;
    const E_AMOUNT_MISMATCH: u64 = 4;
    const E_PRODUCT_MERCHANT_MISMATCH: u64 = 5;
    const E_INVOICE_MERCHANT_MISMATCH: u64 = 6;

    const STATUS_UNPAID: u8 = 0;
    const STATUS_PAID: u8 = 1;

    public struct Merchant has key, store {
        id: object::UID,
        owner: address,
        name: vector<u8>,
        treasury: address,
    }

    public struct Product has key, store {
        id: object::UID,
        merchant_id: object::ID,
        title: vector<u8>,
        price_u64: u64,
        active: bool,
    }

    public struct Invoice has key, store {
        id: object::UID,
        product_id: object::ID,
        merchant_id: object::ID,
        amount_u64: u64,
        status: u8,
        buyer: option::Option<address>,
        created_at_ms: u64,
    }

    public struct Receipt has key, store {
        id: object::UID,
        invoice_id: object::ID,
        buyer: address,
        paid_amount_u64: u64,
        paid_at_ms: u64,
    }

    public struct InvoiceCreated has copy, drop {
        invoice_id: object::ID,
        product_id: object::ID,
        merchant_id: object::ID,
        amount_u64: u64,
        created_at_ms: u64,
    }

    public struct InvoicePaid has copy, drop {
        invoice_id: object::ID,
        merchant_id: object::ID,
        buyer: address,
        paid_amount_u64: u64,
        paid_at_ms: u64,
    }

    public struct ReceiptMinted has copy, drop {
        receipt_id: object::ID,
        invoice_id: object::ID,
        buyer: address,
        paid_amount_u64: u64,
        paid_at_ms: u64,
    }

    public fun status_unpaid(): u8 {
        STATUS_UNPAID
    }

    public fun status_paid(): u8 {
        STATUS_PAID
    }

    #[allow(lint(self_transfer))]
    public fun create_merchant(name: vector<u8>, treasury: address, ctx: &mut tx_context::TxContext) {
        let sender = tx_context::sender(ctx);
        let merchant = new_merchant(sender, name, treasury, ctx);
        transfer::public_transfer(merchant, sender);
    }

    #[allow(lint(self_transfer))]
    public fun create_product(
        merchant: &Merchant,
        title: vector<u8>,
        price_u64: u64,
        ctx: &mut tx_context::TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert_merchant_owner(merchant, sender);

        let product = new_product(object::id(merchant), title, price_u64, true, ctx);
        transfer::public_transfer(product, sender);
    }

    public fun create_invoice(
        merchant: &Merchant,
        product: &Product,
        ctx: &mut tx_context::TxContext,
    ): Invoice {
        let sender = tx_context::sender(ctx);
        assert_merchant_owner(merchant, sender);
        create_invoice_impl(merchant, product, ctx)
    }

    #[allow(lint(self_transfer))]
    public fun create_invoice_and_transfer(
        merchant: &Merchant,
        product: &Product,
        ctx: &mut tx_context::TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        let invoice = create_invoice(merchant, product, ctx);
        transfer::public_transfer(invoice, sender);
    }

    public fun pay_invoice<T>(
        merchant: &Merchant,
        invoice: &mut Invoice,
        payment: Coin<T>,
        ctx: &mut tx_context::TxContext,
    ): Receipt {
        pay_invoice_impl(merchant, invoice, payment, ctx)
    }

    #[allow(lint(self_transfer))]
    public fun pay_invoice_and_transfer<T>(
        merchant: &Merchant,
        invoice: &mut Invoice,
        payment: Coin<T>,
        ctx: &mut tx_context::TxContext,
    ) {
        let buyer = tx_context::sender(ctx);
        let receipt = pay_invoice_impl(merchant, invoice, payment, ctx);
        transfer::public_transfer(receipt, buyer);
    }

    fun pay_invoice_impl<T>(
        merchant: &Merchant,
        invoice: &mut Invoice,
        payment: Coin<T>,
        ctx: &mut tx_context::TxContext,
    ): Receipt {
        assert!(invoice.status == STATUS_UNPAID, E_INVOICE_ALREADY_PAID);
        assert!(invoice.merchant_id == object::id(merchant), E_INVOICE_MERCHANT_MISMATCH);

        let paid_amount = coin::value(&payment);
        assert!(paid_amount == invoice.amount_u64, E_AMOUNT_MISMATCH);

        transfer::public_transfer(payment, merchant.treasury);

        let buyer = tx_context::sender(ctx);
        let paid_at_ms = tx_context::epoch_timestamp_ms(ctx);
        invoice.status = STATUS_PAID;
        invoice.buyer = option::some(buyer);

        event::emit(InvoicePaid {
            invoice_id: object::id(invoice),
            merchant_id: invoice.merchant_id,
            buyer,
            paid_amount_u64: paid_amount,
            paid_at_ms,
        });

        let receipt = Receipt {
            id: object::new(ctx),
            invoice_id: object::id(invoice),
            buyer,
            paid_amount_u64: paid_amount,
            paid_at_ms,
        };

        event::emit(ReceiptMinted {
            receipt_id: object::id(&receipt),
            invoice_id: object::id(invoice),
            buyer,
            paid_amount_u64: paid_amount,
            paid_at_ms,
        });

        receipt
    }

    fun create_invoice_impl(
        merchant: &Merchant,
        product: &Product,
        ctx: &mut tx_context::TxContext,
    ): Invoice {
        assert!(product.active, E_PRODUCT_INACTIVE);
        assert!(product.merchant_id == object::id(merchant), E_PRODUCT_MERCHANT_MISMATCH);

        let invoice = Invoice {
            id: object::new(ctx),
            product_id: object::id(product),
            merchant_id: object::id(merchant),
            amount_u64: product.price_u64,
            status: STATUS_UNPAID,
            buyer: option::none(),
            created_at_ms: tx_context::epoch_timestamp_ms(ctx),
        };

        event::emit(InvoiceCreated {
            invoice_id: object::id(&invoice),
            product_id: object::id(product),
            merchant_id: object::id(merchant),
            amount_u64: product.price_u64,
            created_at_ms: invoice.created_at_ms,
        });

        invoice
    }

    fun new_merchant(
        owner: address,
        name: vector<u8>,
        treasury: address,
        ctx: &mut tx_context::TxContext,
    ): Merchant {
        Merchant {
            id: object::new(ctx),
            owner,
            name,
            treasury,
        }
    }

    fun new_product(
        merchant_id: object::ID,
        title: vector<u8>,
        price_u64: u64,
        active: bool,
        ctx: &mut tx_context::TxContext,
    ): Product {
        Product {
            id: object::new(ctx),
            merchant_id,
            title,
            price_u64,
            active,
        }
    }

    fun assert_merchant_owner(merchant: &Merchant, sender: address) {
        assert!(merchant.owner == sender, E_NOT_MERCHANT_OWNER);
    }

    #[test]
    fun create_invoice_minimal_test() {
        let mut ctx = tx_context::dummy();
        let owner = @0xA;
        let merchant = new_merchant(owner, b"ACME", owner, &mut ctx);
        let product = new_product(object::id(&merchant), b"Starter", 42, true, &mut ctx);
        let invoice = create_invoice_impl(&merchant, &product, &mut ctx);

        assert!(invoice.amount_u64 == 42, 100);
        assert!(invoice.status == STATUS_UNPAID, 101);
        assert!(option::is_none(&invoice.buyer), 102);

        destroy_invoice_for_testing(invoice);
        destroy_product_for_testing(product);
        destroy_merchant_for_testing(merchant);
    }

    #[test]
    fun pay_invoice_zero_amount_minimal_test() {
        let mut ctx = tx_context::dummy();
        let owner = @0xA;
        let treasury = @0xB;

        let merchant = new_merchant(owner, b"ACME", treasury, &mut ctx);
        let product = new_product(object::id(&merchant), b"ZeroPlan", 0, true, &mut ctx);
        let mut invoice = create_invoice_impl(&merchant, &product, &mut ctx);

        let zero_payment = coin::zero<sui::sui::SUI>(&mut ctx);
        let receipt = pay_invoice_impl<sui::sui::SUI>(&merchant, &mut invoice, zero_payment, &mut ctx);

        assert!(invoice.status == STATUS_PAID, 200);
        assert!(option::is_some(&invoice.buyer), 201);
        assert!(receipt.paid_amount_u64 == 0, 202);

        destroy_receipt_for_testing(receipt);
        destroy_invoice_for_testing(invoice);
        destroy_product_for_testing(product);
        destroy_merchant_for_testing(merchant);
    }

    #[test_only]
    fun destroy_merchant_for_testing(merchant: Merchant) {
        let Merchant {
            id,
            owner: _,
            name: _,
            treasury: _,
        } = merchant;
        id.delete();
    }

    #[test_only]
    fun destroy_product_for_testing(product: Product) {
        let Product {
            id,
            merchant_id: _,
            title: _,
            price_u64: _,
            active: _,
        } = product;
        id.delete();
    }

    #[test_only]
    fun destroy_invoice_for_testing(invoice: Invoice) {
        let Invoice {
            id,
            product_id: _,
            merchant_id: _,
            amount_u64: _,
            status: _,
            buyer: _,
            created_at_ms: _,
        } = invoice;
        id.delete();
    }

    #[test_only]
    fun destroy_receipt_for_testing(receipt: Receipt) {
        let Receipt {
            id,
            invoice_id: _,
            buyer: _,
            paid_amount_u64: _,
            paid_at_ms: _,
        } = receipt;
        id.delete();
    }
}
