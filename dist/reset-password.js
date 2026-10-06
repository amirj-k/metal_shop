const supabaseClient = window.supabaseClient;

const resetForm =
    document.getElementById("resetPasswordForm");

const message =
    document.getElementById("message");

const resetBtn =
    document.getElementById("resetBtn");


resetForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const password =
        document.getElementById("password")
            .value;

    const confirmPassword =
        document.getElementById("confirmPassword")
            .value;

    message.textContent = "";


    if (!password || !confirmPassword) {

        message.textContent =
            "Please enter both passwords.";

        return;
    }


    if (password !== confirmPassword) {

        message.textContent =
            "Passwords do not match.";

        return;
    }


    if (password.length < 6) {

        message.textContent =
            "Password must be at least 6 characters.";

        return;
    }


    resetBtn.disabled = true;
    resetBtn.textContent = "Updating...";


    try {

        const { error } =
            await supabaseClient.auth.updateUser({
                password: password
            });


        if (error) {

            console.error(
                "Supabase password update error:",
                error
            );

            message.textContent =
                error.message;

            return;
        }


        message.textContent =
            "Password updated successfully.";


        resetForm.reset();


        setTimeout(() => {
            window.location.href = "/login";
        }, 1500);


    } catch (error) {

        console.error(
            "Unexpected error:",
            error
        );

        message.textContent =
            "Something went wrong. Please try again.";

    } finally {

        resetBtn.disabled = false;
        resetBtn.textContent =
            "Update password";
    }

});
