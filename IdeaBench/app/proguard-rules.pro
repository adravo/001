# Keep kotlinx.serialization models used for Anthropic API + Room entities.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class com.ideabench.app.**$$serializer { *; }
-keepclassmembers class com.ideabench.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.ideabench.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep class com.ideabench.app.data.remote.** { *; }
-keep class com.ideabench.app.data.local.** { *; }
