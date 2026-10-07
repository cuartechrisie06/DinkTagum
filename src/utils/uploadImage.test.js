jest.mock("../../lib/supabase", () => ({ supabase: null }));
const { base64ToBytes, detectImageType } = require("./uploadImage");

describe("uploaded image checks", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(detectImageType(base64ToBytes("/9j/4AAQSkZJRgABAQAAAQ==")).type).toBe("image/jpeg");
    expect(detectImageType(base64ToBytes("iVBORw0KGgoAAAANSUhEUg==")).type).toBe("image/png");
    expect(detectImageType(base64ToBytes("UklGRiQAAABXRUJQVlA4IA==")).type).toBe("image/webp");
  });

  it("rejects the error text that used to be uploaded as a photo", () => {
    const text = new Uint8Array([..."File not found"].map((ch) => ch.charCodeAt(0)));
    expect(detectImageType(text)).toBeNull();
    expect(detectImageType(new Uint8Array(4))).toBeNull();
  });

  it("accepts a data: URL prefix", () => {
    expect(detectImageType(base64ToBytes("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==")).type).toBe("image/png");
  });
});
