import type { TestPaymentOfferDto } from "@interactive-story/api-contracts";
import { useState } from "react";

interface PaymentIntentCardProps {
  offer: TestPaymentOfferDto;
  onClick: () => void;
}

export function PaymentIntentCard({ offer, onClick }: PaymentIntentCardProps) {
  const [recorded, setRecorded] = useState(false);
  const price = new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: offer.currency,
  }).format(offer.priceMinor / 100);

  const handleClick = () => {
    onClick();
    setRecorded(true);
  };

  return (
    <section className="mb-4 rounded-2xl border border-fuchsia-300/25 bg-fuchsia-300/10 p-5 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-fuchsia-300">NEXT CHAPTER</p>
      <h2 className="mt-2 text-xl font-semibold text-white">{offer.title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{offer.description}</p>
      <p className="mt-4 text-2xl font-bold text-fuchsia-200">{price}</p>
      <button
        className="mt-4 w-full rounded-full bg-fuchsia-300 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-fuchsia-200 disabled:cursor-default disabled:bg-emerald-300"
        disabled={recorded}
        type="button"
        onClick={handleClick}
      >
        {recorded ? "已记录解锁意向" : offer.buttonLabel}
      </button>
      <p className="mt-3 text-xs text-zinc-400">
        {recorded ? "本次测试不会产生扣款。" : "意向测试，不会跳转支付或产生扣款。"}
      </p>
    </section>
  );
}
