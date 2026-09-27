import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PaymentIntentCard } from "./PaymentIntentCard";

describe("PaymentIntentCard", () => {
  it("shows a test price and records intent without starting payment", async () => {
    const onClick = vi.fn();
    render(
      <PaymentIntentCard
        offer={{
          code: "chapter01-ending002-unlock",
          chapterCode: "chapter-01",
          triggerNodeCode: "Ending002",
          title: "解锁下一章",
          description: "付费意向测试",
          buttonLabel: "¥9.90 解锁下一章",
          priceMinor: 990,
          currency: "CNY",
        }}
        onClick={onClick}
      />,
    );

    expect(screen.getByText("¥9.90")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "¥9.90 解锁下一章" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "已记录解锁意向" })).toBeDisabled();
    expect(screen.getByText("本次测试不会产生扣款。")).toBeInTheDocument();
  });
});
