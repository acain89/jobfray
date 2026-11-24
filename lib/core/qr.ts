/** QR Code Model 2, fixed version 6-L, byte mode, mask 0. No external service. */
export function qrSvg(text: string): string {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > 134)
        throw new Error("Public link is too long for this QR code");
    const bits: number[] = [];
    const append = (n: number, count: number) => {
        for (let i = count - 1; i >= 0; i--)
            bits.push((n >>> i) & 1);
    };
    append(4, 4);
    append(bytes.length, 8);
    for (const b of bytes)
        append(b, 8);
    append(0, Math.min(4, 1088 - bits.length));
    while (bits.length % 8)
        bits.push(0);
    const data: number[] = [];
    for (let i = 0; i < bits.length; i += 8)
        data.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));
    for (let i = 0; data.length < 136; i++)
        data.push(i % 2 ? 0x11 : 0xec);
    const mul = (x: number, y: number) => {
        let z = 0;
        for (let i = 7; i >= 0; i--) {
            z = (z << 1) ^ ((z >>> 7) * 0x11d);
            z ^= ((y >>> i) & 1) * x;
        }
        return z;
    };
    let generator = [1], root = 1;
    for (let i = 0; i < 18; i++) {
        const next = new Array<number>(generator.length + 1).fill(0);
        generator.forEach((v, j) => { next[j] = next[j]! ^ v; next[j + 1] = next[j + 1]! ^ mul(v, root); });
        generator = next;
        root = mul(root, 2);
    }
    const ecc = (block: number[]) => {
        const result = new Array<number>(18).fill(0);
        for (const value of block) {
            const factor = value ^ result.shift()!;
            result.push(0);
            for (let i = 0; i < 18; i++)
                result[i] = result[i]! ^ mul(generator[i + 1]!, factor);
        }
        return result;
    };
    const blocks = [data.slice(0, 68), data.slice(68)], checks = blocks.map(ecc), interleaved: number[] = [];
    for (let i = 0; i < 68; i++)
        for (const b of blocks)
            interleaved.push(b[i]!);
    for (let i = 0; i < 18; i++)
        for (const b of checks)
            interleaved.push(b[i]!);
    const size = 41, matrix = Array.from({ length: size }, () => new Array<boolean>(size).fill(false)), reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const set = (x: number, y: number, dark: boolean) => {
        if (x >= 0 && x < size && y >= 0 && y < size) {
            matrix[y]![x] = dark;
            reserved[y]![x] = true;
        }
    };
    for (const [cx, cy] of [[3, 3], [37, 3], [3, 37]])
        for (let dy = -4; dy <= 4; dy++)
            for (let dx = -4; dx <= 4; dx++) {
                const d = Math.max(Math.abs(dx), Math.abs(dy));
                set(cx! + dx, cy! + dy, d !== 2 && d !== 4);
            }
    for (let i = 0; i < size; i++) {
        if (!reserved[6]![i])
            set(i, 6, i % 2 === 0);
        if (!reserved[i]![6])
            set(6, i, i % 2 === 0);
    }
    for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
            set(34 + dx, 34 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    const format = 0x77c4, bit = (i: number) => ((format >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++)
        set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++)
        set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++)
        set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++)
        set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
    let index = 0, up = true;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6)
            right = 5;
        for (let vertical = 0; vertical < size; vertical++) {
            const y = up ? size - 1 - vertical : vertical;
            for (let j = 0; j < 2; j++) {
                const x = right - j;
                if (reserved[y]![x])
                    continue;
                const value = index < interleaved.length * 8 ? ((interleaved[Math.floor(index / 8)]! >>> (7 - index % 8)) & 1) !== 0 : false;
                matrix[y]![x] = value !== ((x + y) % 2 === 0);
                index++;
            }
        }
        up = !up;
    }
    const paths: string[] = [];
    matrix.forEach((row, y) => row.forEach((v, x) => {
        if (v)
            paths.push(`M${x + 4},${y + 4}h1v1h-1z`);
    }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 49 49" role="img" aria-label="Business website QR code"><rect width="49" height="49" fill="white"/><path d="${paths.join("")}" fill="black"/></svg>`;
}
