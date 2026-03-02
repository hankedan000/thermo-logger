export class Version {
  public readonly major: number;
  public readonly minor: number;
  public readonly patch: number;

  constructor(major: number, minor: number, patch: number) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
  }

  static parse(input: string): Version {
    const match = input.match(/v?(\d+)\.(\d+)\.(\d+)/);

    if (!match) {
      throw new Error(`No valid version found in: "${input}"`);
    }

    return new Version(
      Number(match[1]),
      Number(match[2]),
      Number(match[3])
    );
  }

  compare(other: Version): number {
    if (this.major !== other.major) {
      return this.major - other.major;
    }
    if (this.minor !== other.minor) {
      return this.minor - other.minor;
    }
    return this.patch - other.patch;
  }

  isGreaterThan(other: Version): boolean {
    return this.compare(other) > 0;
  }

  isLessThan(other: Version): boolean {
    return this.compare(other) < 0;
  }

  equals(other: Version): boolean {
    return this.compare(other) === 0;
  }

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }

  toTag(): string {
    return `v${this.toString()}`;
  }
}