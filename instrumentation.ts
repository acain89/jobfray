export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const {validateConfiguration,assertLocalTestBinding} = await import("./lib/core/configuration");
        try {validateConfiguration();assertLocalTestBinding();}
        catch {
            console.error(JSON.stringify({event:"startup_configuration_invalid"}));
            // Next may keep its listener alive after a rejected instrumentation hook.
            // A misconfigured production server must terminate instead of remaining half-started.
            if(process.env.NODE_ENV === "production")process.exit(1);
            throw new Error("Application startup configuration is invalid");
        }
    }
}
