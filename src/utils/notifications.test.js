import { dedupeNotifications } from "./notifications";

const received = (id, is_read = true) => ({ id, kind: "reservation", title: "Reservation received", body: "Your court reservation is pending confirmation.", related_id: null, is_read });

describe("dedupeNotifications", () => {
  it("collapses repeated identical notifications into the newest", () => {
    const list = dedupeNotifications([received("n3"), received("n2", false), received("n1")]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "n3", ids: ["n3", "n2", "n1"], duplicates: 2, is_read: false });
  });

  it("keeps notifications about different bookings or events apart", () => {
    const list = dedupeNotifications([
      { ...received("a"), related_id: "r1" },
      { ...received("b"), related_id: "r2" },
      { ...received("c"), title: "Reservation confirmed", related_id: "r1" },
    ]);
    expect(list.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});
