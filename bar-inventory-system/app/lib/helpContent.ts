export type HelpArticle = {
  id: string;
  title: string;
  category: string;
  questions: string[];
  keywords: string[];
  answer: string[];
  href?: string;
  linkLabel?: string;
};

export const helpArticles: HelpArticle[] = [
  {
    id: 'invoice',
    title: 'How do I create an invoice?',
    category: 'Sales',
    questions: ['create an invoice', 'make an invoice', 'bill a customer'],
    keywords: ['invoice', 'invoicing', 'bill customer', 'sales invoice'],
    answer: [
      'Open Sales A/R → Invoices and choose Add invoice (or use Sell now on the dashboard).',
      'Walk-in Customer is selected by default. Choose a saved customer if needed, then select products and quantities.',
      'Check the total. Enter a payment amount if the customer is paying now, then choose Save. Issued invoices reduce stock; drafts do not.',
    ],
    href: '/sales-ar/invoice',
    linkLabel: 'Open Invoices',
  },
  {
    id: 'quotation',
    title: 'How do I create a quotation?',
    category: 'Sales',
    questions: ['create a quotation', 'make a quote', 'send customer a price offer'],
    keywords: ['quotation', 'quote', 'price offer'],
    answer: [
      'Open Sales A/R → Quotations and select Add quotation.',
      'Choose the customer, add products, and set quantities, prices, discounts, and tax.',
      'Save the quotation. It does not deduct stock. Use Actions later to create an invoice or another document.',
    ],
    href: '/sales-ar/quotation',
    linkLabel: 'Open Quotations',
  },
  {
    id: 'receive-stock',
    title: 'How do I receive stock?',
    category: 'Inventory',
    questions: ['receive stock', 'add supplier delivery', 'stock delivery'],
    keywords: ['receive', 'receiving', 'stock delivery', 'purchase order', 'supplier stock'],
    answer: [
      'Open Purchases and select Add purchase.',
      'Choose the supplier and receiving location, then add products, quantities, and costs.',
      'Save as delivered to receive stock now, or save as pending if it still needs approval. Use Purchases for supplier deliveries, not stock adjustments.',
    ],
    href: '/purchases',
    linkLabel: 'Open Purchases',
  },
  {
    id: 'stock-adjustment',
    title: 'How do I correct a stock count?',
    category: 'Inventory',
    questions: ['adjust stock', 'correct stock count', 'record damaged stock'],
    keywords: ['stock adjustment', 'physical count', 'wastage', 'damage', 'missing stock', 'stock correction'],
    answer: [
      'Open Inventory → Stock adjustments and choose Add.',
      'Select the location and product, choose increase or decrease, enter the quantity, and explain the reason.',
      'Save to post the correction immediately. Use Purchases for supplier deliveries and Stock transfers to move stock between locations.',
    ],
    href: '/stock-adjustments',
    linkLabel: 'Open Stock Adjustments',
  },
  {
    id: 'transfer-stock',
    title: 'How do I transfer stock between locations?',
    category: 'Inventory',
    questions: ['transfer stock', 'move stock between branches', 'send products to another shop'],
    keywords: ['stock transfer', 'transfer between locations', 'another branch', 'move inventory'],
    answer: [
      'Open Inventory → Stock transfers and choose Add.',
      'Select the source and receiving locations, search for products, and enter the quantities.',
      'Save the transfer. Stock moves immediately. Products must have a SKU, and the receiving product uses the same SKU and stock unit.',
    ],
    href: '/stock-transfers',
    linkLabel: 'Open Stock Transfers',
  },
  {
    id: 'payment',
    title: 'How do I record a customer payment?',
    category: 'Sales',
    questions: ['record a customer payment', 'customer paid an invoice', 'receive invoice payment'],
    keywords: ['payment', 'customer paid', 'invoice balance', 'record receipt'],
    answer: [
      'Open Sales A/R → Invoices and find the issued invoice.',
      'Open Actions → Record / view payments, enter the amount received, choose the payment method, and save.',
      'For a new invoice, you can enter the amount being paid when you create it. The amount cannot exceed the invoice total.',
    ],
    href: '/sales-ar/invoice',
    linkLabel: 'Open Invoices',
  },
  {
    id: 'supplier-payment',
    title: 'How do I pay a supplier?',
    category: 'Purchasing',
    questions: ['pay a supplier', 'record a supplier payment', 'pay a purchase bill'],
    keywords: ['supplier payment', 'supplier bill', 'purchase payment', 'pay supplier'],
    answer: [
      'Open Purchases and find the delivered purchase for that supplier.',
      'Open the purchase and choose Record supplier payment.',
      'Enter the amount, method, and payment account, then save. You can record a partial payment and return later to pay the remaining balance.',
    ],
    href: '/purchases',
    linkLabel: 'Open Purchases',
  },
  {
    id: 'credit-note',
    title: 'How do I create a credit note?',
    category: 'Sales',
    questions: ['create a credit note', 'return a sale', 'refund an invoice'],
    keywords: ['credit note', 'return product', 'refund', 'invoice return'],
    answer: [
      'Find the issued invoice under Sales A/R → Invoices, then open Actions → Create credit note.',
      'The original invoice and customer are linked. Add the products and quantities being returned.',
      'Save the credit note. Returned quantities cannot exceed the invoiced quantity that has not already been credited.',
    ],
    href: '/sales-ar/invoice',
    linkLabel: 'Open Invoices',
  },
  {
    id: 'whatsapp-report',
    title: 'How do I share a daily report on WhatsApp?',
    category: 'Reports',
    questions: ['share a sales report', 'send daily report on whatsapp'],
    keywords: ['whatsapp', 'daily report', 'sales report', 'share report'],
    answer: [
      'Open Reports and choose the daily sales WhatsApp report.',
      'Review or edit the prepared message, then open WhatsApp.',
      'Choose the recipient and tap Send in WhatsApp. The app prepares the message but does not send it automatically.',
    ],
    href: '/reports',
    linkLabel: 'Open Reports',
  },
  {
    id: 'treasury-ledger',
    title: 'How do Treasury accounts connect to the Chart of Accounts?',
    category: 'Accounting',
    questions: ['create a treasury account', 'treasury account in chart of accounts', 'link bank account'],
    keywords: ['treasury', 'chart of accounts', 'ledger', 'cash account', 'bank account'],
    answer: [
      'Open Treasury and choose Add account.',
      'By default, saving a Treasury account creates a matching asset ledger in the Chart of Accounts. You can instead select an existing asset account.',
      'Treasury activity uses the linked ledger, so do not link the same ledger to multiple Treasury accounts.',
    ],
    href: '/account/account',
    linkLabel: 'Open Treasury',
  },
  {
    id: 'zero-stock',
    title: 'Can I sell a product with no stock?',
    category: 'Inventory',
    questions: ['sell when stock is zero', 'why is sale blocked', 'out of stock sale'],
    keywords: ['zero stock', 'no stock', 'out of stock', 'insufficient stock', 'sell stock'],
    answer: [
      'No. POS sales and issued invoices are blocked when there is not enough stock.',
      'Receive stock through Purchases, transfer it from another location, or correct an inaccurate count in Stock adjustments.',
      'Quotations and invoice drafts do not post stock until an invoice is issued.',
    ],
    href: '/inventory',
    linkLabel: 'Open Inventory',
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function findHelpArticles(question: string): HelpArticle[] {
  const query = normalize(question);
  if (!query) return [];
  const words = new Set(query.split(' ').filter(word => word.length > 2));
  return helpArticles
    .map(article => {
      const title = normalize(article.title);
      const phrases = [...article.questions, ...article.keywords].map(normalize);
      let score = phrases.reduce((sum, phrase) => sum + (query.includes(phrase) ? phrase.split(' ').length * 3 : 0), 0);
      score += [...words].reduce((sum, word) => sum + (title.includes(word) ? 2 : 0) + (phrases.some(phrase => phrase.includes(word)) ? 1 : 0), 0);
      return { article, score };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(result => result.article);
}
