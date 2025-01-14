type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private static instance: Logger;
  private isDebug: boolean = false;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  enableDebug() {
    this.isDebug = true;
  }

  private replaceBigInt(key: string, value: any) {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataString = data ? `\nData: ${JSON.stringify(data, this.replaceBigInt, 2)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${dataString}`;
  }

  debug(message: string, data?: any) {
    if (this.isDebug) {
      console.debug(this.formatMessage('debug', message, data));
    }
  }

  info(message: string, data?: any) {
    console.info(this.formatMessage('info', message, data));
  }

  warn(message: string, data?: any) {
    console.warn(this.formatMessage('warn', message, data));
  }

  error(message: string, error?: any) {
    console.error(this.formatMessage('error', message, error));
  }
}

export const logger = Logger.getInstance(); 