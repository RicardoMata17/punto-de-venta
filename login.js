const form = document.getElementById("loginForm");
const err = document.getElementById("loginError");

form.addEventListener("submit", (e)=>{
  e.preventDefault();
  err.hidden = true;

  const data = Object.fromEntries(new FormData(form).entries());

  // Datos de prueba
  if (data.username === "vendedor" && data.password === "1234") {
    localStorage.setItem("demo_session", JSON.stringify({ name: "Vendedor Demo" }));
    window.location.href = "app.html";
  } else {
    err.textContent = "Usuario o contraseña incorrectos.";
    err.hidden = false;
  }
});