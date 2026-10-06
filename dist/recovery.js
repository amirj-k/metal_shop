const supabaseClient = window.supabaseClient;

const recoveryForm =
    document.getElementById("recoveryForm");


if (recoveryForm) {

    const message =
        document.getElementById("message");

    const recoverBtn =
        document.getElementById("recoverBtn");


    recoveryForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const email =
            document
                .getElementById("email")
                .value
                .trim();


        message.textContent = "";


        if (!email) {
            message.textContent =
                "Please enter your email.";

            return;
        }


        recoverBtn.disabled = true;
        recoverBtn.textContent = "Sending...";


        try {

            const { error } =
                await supabaseClient.auth.resetPasswordForEmail(
                    email,
                    {
                        redirectTo:
                            `${window.location.origin}/reset-password`
                    }
                );


            if (error) {

                console.error(
                    "Supabase reset error:",
                    error
                );

                message.textContent =
                    error.message;

                return;
            }


            message.textContent =
                "Password reset link sent. Check your email.";


        } catch (error) {

            console.error(
                "Unexpected error:",
                error
            );

            message.textContent =
                "Something went wrong. Please try again.";

        } finally {

            recoverBtn.disabled = false;
            recoverBtn.textContent =
                "Recover password";
        }

    });

}
