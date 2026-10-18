using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace PrimeVideoRpc {
    internal static class Json {
        public static string Encode(object value) { return new JavaScriptSerializer().Serialize(value); }
        public static Dictionary<string, object> Decode(string value) {
            var result = new JavaScriptSerializer { MaxJsonLength = 65536, RecursionLimit = 16 }.DeserializeObject(value) as Dictionary<string, object>;
            if (result == null) throw new InvalidDataException("Expected a JSON object.");
            return result;
        }
        public static object Get(Dictionary<string, object> value, string key) {
            object result; return value != null && value.TryGetValue(key, out result) ? result : null;
        }
        public static string Text(Dictionary<string, object> value, string key) { return Get(value, key) as string ?? ""; }
    }
    internal static class Protocol {
        public const int MaxLength = 65536;
        public static byte[] ReadExact(Stream stream, int length, int timeout) {
            var data = new byte[length];
            var offset = 0;
            while (offset < length) {
                int count;
                if (timeout > 0) {
                    var pending = stream.BeginRead(data, offset, length - offset, null, null);
                    using (var wait = pending.AsyncWaitHandle) {
                        if (!wait.WaitOne(timeout)) { stream.Dispose(); throw new TimeoutException("Discord did not respond."); }
                        count = stream.EndRead(pending);
                    }
                } else count = stream.Read(data, offset, length - offset);
                if (count == 0) {
                    if (offset == 0) return null;
                    throw new EndOfStreamException("Incomplete message.");
                }
                offset += count;
            }
            return data;
        }
        public static byte[] ReadBody(Stream stream, byte[] header, int offset, int timeout) {
            uint size = BitConverter.ToUInt32(header, offset);
            if (size == 0 || size > MaxLength) throw new InvalidDataException("Message length is out of bounds.");
            var body = ReadExact(stream, (int)size, timeout);
            if (body == null) throw new EndOfStreamException("Missing message body.");
            return body;
        }
        public static Dictionary<string, object> ReadNative(Stream stream) {
            var header = ReadExact(stream, 4, 0);
            if (header == null) return null;
            return Json.Decode(new UTF8Encoding(false, true).GetString(ReadBody(stream, header, 0, 0)));
        }
        public static void WriteNative(Stream stream, object value) {
            var bytes = Encoding.UTF8.GetBytes(Json.Encode(value));
            stream.Write(BitConverter.GetBytes(bytes.Length), 0, 4);
            stream.Write(bytes, 0, bytes.Length); stream.Flush();
        }
        public static void WriteRpc(Stream stream, int opcode, byte[] body) {
            stream.Write(BitConverter.GetBytes(opcode), 0, 4);
            stream.Write(BitConverter.GetBytes(body.Length), 0, 4);
            stream.Write(body, 0, body.Length); stream.Flush();
        }
    }
}
