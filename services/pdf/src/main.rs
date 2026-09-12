//! Modern Todo's PDF renderer.
//!
//! A deliberately small service: it takes a document tree over HTTP and gives
//! back PDF bytes. It never touches the database, never reads a file outside
//! its own binary, and accepts no URLs - the only thing it can be persuaded to
//! do is render.

mod markup;
mod payload;
mod render;

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::{Duration, Instant};

use axum::body::Bytes;
use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;
use tower_http::timeout::TimeoutLayer;

use payload::RenderRequest;

/// Requests larger than this are refused outright. A document tree is text.
const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

/// A render that has not finished by now is not going to.
const RENDER_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone)]
struct AppState {
    key: String,
}

/// Compare in constant time, so a wrong key cannot be discovered byte by byte.
fn keys_match(expected: &str, provided: &str) -> bool {
    if expected.len() != provided.len() {
        return false;
    }
    let mut difference = 0u8;
    for (a, b) in expected.bytes().zip(provided.bytes()) {
        difference |= a ^ b;
    }
    difference == 0
}

fn error(status: StatusCode, request_id: &str, message: impl Into<String>) -> Response {
    (status, Json(json!({ "error": message.into(), "requestId": request_id }))).into_response()
}

async fn health() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "service": "modern-todo-pdf",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn render_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let provided = headers
        .get("x-internal-key")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();

    if !keys_match(&state.key, provided) {
        // No detail: a caller without the key learns nothing about it.
        return error(StatusCode::UNAUTHORIZED, "", "Unauthorized");
    }

    let request: RenderRequest = match serde_json::from_slice(&body) {
        Ok(parsed) => parsed,
        Err(err) => {
            return error(StatusCode::BAD_REQUEST, "", format!("Malformed request: {err}"));
        }
    };
    let request_id = request.request_id.clone();

    let started = Instant::now();
    // Rendering is CPU-bound and would otherwise block the async runtime,
    // stalling every other request behind one large document.
    let result = tokio::task::spawn_blocking(move || {
        // Everything that borrows `request` is read before anything moves out.
        let template = request.template.clone();
        let size = render::body_size(&request);
        (render::render(&request), template, size)
    })
    .await;

    let (bytes, template, size) = match result {
        Ok(value) => value,
        Err(err) => {
            tracing::error!(request_id = %request_id, error = %err, "render task panicked");
            return error(StatusCode::INTERNAL_SERVER_ERROR, &request_id, "Renderer failed");
        }
    };

    match bytes {
        Ok(pdf) => {
            tracing::info!(
                request_id = %request_id,
                template = %template,
                body_bytes = size,
                pdf_bytes = pdf.len(),
                ms = started.elapsed().as_millis(),
                "rendered"
            );
            (
                StatusCode::OK,
                [
                    (header::CONTENT_TYPE, "application/pdf"),
                    (header::CACHE_CONTROL, "no-store"),
                ],
                pdf,
            )
                .into_response()
        }
        Err(err) => {
            tracing::error!(request_id = %request_id, template = %template, error = %err, "render failed");
            error(StatusCode::UNPROCESSABLE_ENTITY, &request_id, err.to_string())
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .json()
        .init();

    let key = std::env::var("PDF_SERVICE_KEY").unwrap_or_default();
    if key.len() < 16 {
        // Starting without a real key would make the service open to anything
        // that can reach the port, which is not a state worth running in.
        eprintln!("PDF_SERVICE_KEY must be set and at least 16 characters");
        std::process::exit(1);
    }

    let extra_fonts = render::load_extra_fonts();
    if extra_fonts > 0 {
        tracing::info!(count = extra_fonts, "loaded additional fonts");
    }

    let port: u16 = std::env::var("PDF_SERVICE_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(8787);

    let app = Router::new()
        .route("/health", get(health))
        .route("/render", post(render_handler))
        .layer(TimeoutLayer::with_status_code(StatusCode::SERVICE_UNAVAILABLE, RENDER_TIMEOUT))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .with_state(AppState { key });

    // Loopback by default: sharing a container with the application, this must
    // not be reachable from outside it. PDF_SERVICE_HOST exists for the one
    // deployment where that is wrong - the service alone in its own container,
    // reachable only over an internal network - see
    // example-seperate-service-internal-network-only.txt.
    let host: IpAddr = std::env::var("PDF_SERVICE_HOST")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));
    let address = SocketAddr::new(host, port);
    let listener = match tokio::net::TcpListener::bind(address).await {
        Ok(listener) => listener,
        Err(err) => {
            eprintln!("could not bind {address}: {err}");
            std::process::exit(1);
        }
    };

    tracing::info!(%address, "pdf service listening");

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("server failed");
}

#[cfg(test)]
mod tests {
    use super::keys_match;

    #[test]
    fn key_comparison_rejects_wrong_and_short_keys() {
        assert!(keys_match("a-very-long-secret", "a-very-long-secret"));
        assert!(!keys_match("a-very-long-secret", "a-very-long-secreT"));
        assert!(!keys_match("a-very-long-secret", "short"));
        assert!(!keys_match("a-very-long-secret", ""));
    }
}
