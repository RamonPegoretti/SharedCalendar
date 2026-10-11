// The parts of the Scriptable app (https://scriptable.app) the widget uses.
// Scriptable provides these as globals when it runs the script on the iPhone.

declare class Color {
  constructor(hex: string, alpha?: number)
  static dynamic(light: Color, dark: Color): Color
}

declare class Font {
  static systemFont(size: number): Font
  static mediumSystemFont(size: number): Font
  static semiboldSystemFont(size: number): Font
  static boldSystemFont(size: number): Font
  static lightSystemFont(size: number): Font
}

declare class Size {
  constructor(width: number, height: number)
  width: number
  height: number
}

declare class Point {
  constructor(x: number, y: number)
}

declare class Rect {
  constructor(x: number, y: number, width: number, height: number)
}

declare class Image {
  static fromData(data: Data): Image
  size: Size
}

declare class Data {}

declare class DrawContext {
  size: Size
  opaque: boolean
  respectScreenScale: boolean
  drawImageInRect(image: Image, rect: Rect): void
  setFillColor(color: Color): void
  fillRect(rect: Rect): void
  getImage(): Image
}

declare class WidgetText {
  font: Font
  textColor: Color
  textOpacity: number
  lineLimit: number
  minimumScaleFactor: number
}

declare class WidgetSpacer {}

declare class WidgetStack {
  size: Size
  backgroundColor: Color
  cornerRadius: number
  spacing: number
  url: string
  addText(text: string): WidgetText
  addStack(): WidgetStack
  addSpacer(length?: number): WidgetSpacer
  layoutHorizontally(): void
  layoutVertically(): void
  centerAlignContent(): void
  topAlignContent(): void
  setPadding(top: number, leading: number, bottom: number, trailing: number): void
}

declare class ListWidget {
  backgroundColor: Color
  backgroundImage: Image
  spacing: number
  url: string
  refreshAfterDate: Date
  addText(text: string): WidgetText
  addStack(): WidgetStack
  addSpacer(length?: number): WidgetSpacer
  setPadding(top: number, leading: number, bottom: number, trailing: number): void
  presentSmall(): Promise<void>
  presentMedium(): Promise<void>
  presentLarge(): Promise<void>
}

declare class Request {
  constructor(url: string)
  method: string
  headers: Record<string, string>
  body: string
  timeoutInterval: number
  response: { statusCode: number }
  load(): Promise<Data>
  loadString(): Promise<string>
  loadJSON(): Promise<unknown>
  loadImage(): Promise<Image>
}

declare class Alert {
  title: string
  message: string
  addTextField(placeholder?: string, text?: string): void
  addSecureTextField(placeholder?: string, text?: string): void
  addAction(title: string): void
  addDestructiveAction(title: string): void
  addCancelAction(title: string): void
  textFieldValue(index: number): string
  present(): Promise<number>
}

declare const Keychain: {
  contains(key: string): boolean
  get(key: string): string
  set(key: string, value: string): void
  remove(key: string): void
}

declare class FileManager {
  static local(): FileManager
  documentsDirectory(): string
  cacheDirectory(): string
  joinPath(a: string, b: string): string
  fileExists(path: string): boolean
  readImage(path: string): Image
  writeImage(path: string, image: Image): void
  readString(path: string): string
  writeString(path: string, text: string): void
  modificationDate(path: string): Date | null
  remove(path: string): void
}

declare const Script: {
  setWidget(widget: ListWidget): void
  complete(): void
}

declare const Device: {
  locale(): string
}

declare const config: {
  runsInApp: boolean
  runsInWidget: boolean
  runsInAccessoryWidget: boolean
  widgetFamily: 'small' | 'medium' | 'large' | 'extraLarge' | 'accessoryRectangular' | 'accessoryCircular' | 'accessoryInline' | undefined
}
