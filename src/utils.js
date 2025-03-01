export const zip = (...arrays) => {
    console.log(...arrays);
    return Array.from(
    { length: Math.max(...arrays.map(a => a.length)) },
    (_, i) => arrays.map(a => a[i])
    )
}