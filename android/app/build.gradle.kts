import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// This value is compiled only into the separate acceptance build. It is not
// an intent, preference, environment variable or ordinary-build routing input.
val nativeJourneyDiscoveryOrigin = providers.gradleProperty("careerAcceptanceDiscoveryOrigin").orElse("").get()
if (nativeJourneyDiscoveryOrigin.isNotEmpty()) {
    val origin = URI(nativeJourneyDiscoveryOrigin)
    require(origin.scheme == "https" && origin.host == "10.0.2.2" && origin.port in 1024..65535 &&
        origin.rawUserInfo == null && origin.rawPath.isEmpty() && origin.rawQuery == null && origin.rawFragment == null &&
        nativeJourneyDiscoveryOrigin == "https://10.0.2.2:${origin.port}") {
        "The native journey accepts only its exact loopback-alias HTTPS origin."
    }
}
val acceptanceResources = layout.buildDirectory.dir("generated/acceptance-res")
val prepareAcceptanceCa by tasks.registering {
    val certificatePath = providers.gradleProperty("careerAcceptanceCa")
    inputs.property("certificatePath", certificatePath.orElse(""))
    outputs.dir(acceptanceResources)
    doLast {
        val path = certificatePath.orNull ?: error("Set -PcareerAcceptanceCa to the isolated fixture's public CA PEM.")
        val certificate = file(path).readText()
        require(certificate.contains("-----BEGIN CERTIFICATE-----") && !certificate.contains("PRIVATE KEY")) {
            "Only a public fixture CA certificate may be packaged for acceptance."
        }
        acceptanceResources.get().file("raw/acceptance_ca.pem").asFile.apply {
            parentFile.mkdirs()
            writeText(certificate)
        }
    }
}

android {
    namespace = "com.saleh.careerfinder"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.saleh.careerfinder"
        minSdk = 26
        targetSdk = 36
        versionCode = 7
        versionName = "0.6.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "CAREER_ACCEPTANCE_DISCOVERY_ORIGIN", "\"\"")
    }
    buildTypes {
        debug { applicationIdSuffix = ".preview" }
        release { isMinifyEnabled = false; isDebuggable = false }
        create("acceptance") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".acceptance"
            versionNameSuffix = "-acceptance"
            matchingFallbacks += listOf("debug")
            resValue("string", "app_name", "Career Finder Acceptance")
            buildConfigField("String", "CAREER_ACCEPTANCE_DISCOVERY_ORIGIN", "\"$nativeJourneyDiscoveryOrigin\"")
        }
    }
    testBuildType = if (providers.gradleProperty("careerAcceptance").orNull == "true") "acceptance" else "debug"
    sourceSets.getByName("acceptance").res.srcDir(acceptanceResources)
    // Normal builds contain only the no-op transport boundary. Acceptance owns
    // its separate implementation; the private capability cannot be installed
    // into a preview or release APK.
    sourceSets.getByName("debug").java.srcDir("src/nonAcceptance/java")
    sourceSets.getByName("release").java.srcDir("src/nonAcceptance/java")
    buildFeatures { compose = true; buildConfig = true }
    // Both supported languages must be available for the offline in-app picker.
    bundle { language { enableSplit = false } }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

tasks.matching { it.name == "preAcceptanceBuild" }.configureEach { dependsOn(prepareAcceptanceCa) }

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
