using System;
using System.IO;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace PrimeVideoRpc {
    internal static class Activity {
        public static bool ValidId(string value) { return Regex.IsMatch(value ?? "", @"^[0-9]{17,20}$"); }
        static string Clean(object value, int limit) {
            var text = value as string ?? "";
            text = Regex.Replace(text, @"[\x00-\x1f\x7f]", " ").Trim();
            if (text.Length > limit) text = text.Substring(0, limit);
            if (text.Length > 0 && char.IsHighSurrogate(text[text.Length - 1])) text = text.Substring(0, text.Length - 1);
            return text;
        }
        public static Dictionary<string, object> Sanitize(object input) {
            if (input == null) return null;
            var source = input as Dictionary<string, object>;
            if (source == null) throw new InvalidDataException("Invalid activity.");
            var title = Clean(Json.Get(source, "details"), 128);
            if (title.Length == 0) throw new InvalidDataException("Activity title is missing.");
            var output = new Dictionary<string, object> { {"type",3}, {"details",title} };
            var state = Clean(Json.Get(source, "state"),128);
            if (state.Length > 0) output["state"] = state;
            var assets = Json.Get(source,"assets") as Dictionary<string, object>;
            var image = Clean(Json.Get(assets,"large_image"),1024);
            Uri uri;
            if (Uri.TryCreate(image,UriKind.Absolute,out uri) && uri.Scheme == "https" && uri.UserInfo == "" && uri.IsDefaultPort &&
                Regex.IsMatch(uri.Host,@"(^|\.)(media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com)$")) {
                var text = Clean(Json.Get(assets,"large_text"),128);
                output["assets"] = new Dictionary<string, object> { {"large_image",uri.AbsoluteUri}, {"large_text",text.Length > 0 ? text : "Prime Video"} };
            }
            var stamps = Json.Get(source,"timestamps") as Dictionary<string, object>;
            if (stamps != null) {
                long start, end;
                if (long.TryParse(Convert.ToString(Json.Get(stamps,"start")),out start) &&
                    long.TryParse(Convert.ToString(Json.Get(stamps,"end")),out end) && start > 0 && end > start && end - start <= 2419200)
                    output["timestamps"] = new Dictionary<string,object> { {"start",start}, {"end",end} };
            }
            return output;
        }
    }
}
