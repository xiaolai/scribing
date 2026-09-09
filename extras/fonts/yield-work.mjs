/** A real macrotask boundary without nested setTimeout's 4ms browser clamp.
 * Each channel closes immediately after delivery; canceled jobs retain no ports.
 */
export default function yieldWork() {
  return new Promise((resolve) => {
    if (typeof MessageChannel !== 'function') {
      setTimeout(resolve, 0);
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
}
