import QRCode from "qrcode";

export async function qrSvg(text: string, opts: { dark?: string; light?: string } = {}): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: opts.dark ?? "#1c110b", light: opts.light ?? "#ffffff" },
  });
}

export async function qrPng(text: string, width = 1024): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", errorCorrectionLevel: "M", margin: 2, width, color: { dark: "#1c110bff", light: "#ffffffff" } });
}
