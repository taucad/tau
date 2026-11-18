//! `tau-windows-sandbox`: the Windows half of Tau's contained shell. See README.md for the model, the
//! subcommands, the install record and the framed launch protocol.
//!
//! The protocol, spec validation, journal format and path checks are portable and unit-tested on any
//! host; everything that touches Win32 lives in `win/` and builds only for Windows.

// The portable modules exist for the Windows subcommands; on other hosts only their tests use them.
#![cfg_attr(not(windows), allow(dead_code))]

mod appcontainer;
mod cli;
mod cmdline;
mod frame;
mod install;
mod journal;
mod overlap;
mod paths;
mod protocol;
mod spec;
mod tree;
#[cfg(windows)]
mod win;

use cli::Command;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = match cli::parse(&args) {
        Ok(command) => command,
        Err(message) => {
            eprintln!("tau-windows-sandbox: {message}");
            std::process::exit(2);
        }
    };
    #[cfg(windows)]
    if let Err(err) = win::util::ensure_system_environment() {
        eprintln!("tau-windows-sandbox: the system environment cannot be completed: {err}");
    }
    std::process::exit(dispatch(command));
}

#[cfg(windows)]
fn dispatch(command: Command) -> i32 {
    match command {
        Command::Status { quick } => win::setup::status(quick),
        Command::Setup { for_user, proxy_ports } => {
            match win::setup::setup(&win::setup::SetupOptions { for_user, proxy_ports }) {
                Ok(record) => {
                    // `setup` does not turn Windows Firewall on (machine policy); it says when it is off,
                    // since `launch` refuses until it is on.
                    let mut value = serde_json::to_value(&record).unwrap_or_default();
                    match win::setup::fence(Some(&record)) {
                        Ok(fence) => {
                            value["firewallEnabled"] = fence.firewall_enabled().into();
                            value["rulesPresent"] = fence.rules_present().into();
                            if !fence.firewall_enabled() {
                                let message = install::firewall_off_message(&fence.off_profiles);
                                eprintln!("tau-windows-sandbox setup: {message}");
                                value["warning"] = message.into();
                            }
                        }
                        Err(err) => eprintln!("tau-windows-sandbox setup: the network fence cannot be read: {err}"),
                    }
                    println!("{value}");
                    0
                }
                Err(err) => {
                    eprintln!("tau-windows-sandbox setup: {err}");
                    1
                }
            }
        }
        Command::Revoke => match win::setup::revoke() {
            Ok(()) => {
                println!("{{\"installed\":false}}");
                0
            }
            Err(err) => {
                eprintln!("tau-windows-sandbox revoke: {err}");
                1
            }
        },
        Command::Launch => win::launch::run(),
        Command::Runner { pipe_in, pipe_out, launcher_pid } => {
            win::runner::run(&win::runner::RunnerArgs { pipe_in, pipe_out, launcher_pid })
        }
        Command::Restore { journal } => win::restore::run(&journal),
    }
}

#[cfg(not(windows))]
fn dispatch(command: Command) -> i32 {
    match command {
        Command::Status { .. } => {
            println!("{{\"installed\":false}}");
            0
        }
        _ => {
            eprintln!("tau-windows-sandbox: this command runs only on Windows");
            2
        }
    }
}
